import type { ApiTransport, CatalogItem, CatalogRepository } from "@mobile/ports";
import { crc32 } from "@mobile/domain/crc32";
import { fromRate } from "@mobile/domain/money";

/**
 * Downloads the catalog the signed-in cashier may sell, from the existing server API (xpos.api.catalog_sync),
 * into the device database: staged first, verified against the server's count and CRC32, then activated in one
 * atomic step. The live catalog is never touched until the new one is complete, so an interrupted or failed
 * download leaves the previous catalog usable offline.
 *
 * Not in this milestone: change-feed (delta) updates, stock and customers. Each refresh is a full download.
 */

const API = "xpos.api.catalog_sync";
export const PAGE = 500;
const MAX_ATTEMPTS = 3;

export class CatalogSyncError extends Error {
	constructor(
		readonly code: "resync" | "verify_failed",
		message: string,
	) {
		super(message);
		this.name = "CatalogSyncError";
	}
}

interface ServerBarcode {
	barcode: string;
	uom: string | null;
	conversion_factor: number | null;
}
interface ServerItem {
	item_code: string;
	item_name?: string | null;
	item_group?: string | null;
	stock_uom?: string | null;
	brand?: string | null;
	variant_of?: string | null;
	rate?: number | null;
	barcodes?: ServerBarcode[];
	attributes?: Record<string, string>;
}
interface Begin {
	resync?: string;
	scope: { company: string; warehouse: string; price_list: string | null; currency: string };
	total: number;
	cursors: { items: string };
}
interface Page {
	resync?: string;
	items: ServerItem[];
	next_cursor: string | null;
}
interface Digest {
	count: number;
	checksum: number;
}

export interface SyncProgress {
	downloaded: number;
	total: number;
}

export interface SyncResult {
	items: number;
	/** Barcodes not imported because they sell in a UOM the till cannot price yet (no 1:1 conversion). */
	skippedBarcodes: number;
}

/** Barcodes of the item's stock UOM are imported; a barcode for another UOM would be sold at the wrong price. */
export function toCatalogItem(row: ServerItem, minorDigits: number): { item: CatalogItem; skipped: number } {
	const stockUom = row.stock_uom || "Nos";
	const usable = (row.barcodes ?? []).filter(
		(b) => b.barcode && (!b.uom || b.uom === stockUom || b.conversion_factor === 1),
	);
	return {
		item: {
			itemCode: row.item_code,
			variantOf: row.variant_of || null,
			name: row.item_name || row.item_code,
			itemGroup: row.item_group || "",
			uom: stockUom,
			priceMinor: fromRate(Number(row.rate ?? 0), minorDigits),
			brand: row.brand || null,
			attrs: row.attributes ?? {},
			barcodes: usable.map((b) => b.barcode),
		},
		skipped: (row.barcodes ?? []).length - usable.length,
	};
}

export async function downloadCatalog(opts: {
	api: ApiTransport;
	repo: CatalogRepository;
	scopeId: string;
	site: string;
	profile: string;
	minorDigits: number;
	onProgress?: (p: SyncProgress) => void;
}): Promise<SyncResult> {
	const { api, repo, scopeId, profile, minorDigits } = opts;
	const call = <T>(method: string, args: Record<string, unknown>) =>
		api.call<T>(`${API}.${method}`, { pos_profile: profile, ...args });
	let lastError: unknown;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const begin = await call<Begin>("catalog_begin", {});
		if (begin.resync)
			throw new CatalogSyncError("resync", `The server asked for a fresh start (${begin.resync}).`);
		if (!(await repo.listScopes()).some((s) => s.scopeId === scopeId))
			await repo.createScope({
				scopeId,
				site: opts.site,
				company: begin.scope.company,
				warehouse: begin.scope.warehouse,
				priceList: begin.scope.price_list,
				currency: begin.scope.currency,
				minorDigits,
			});
		const gen = await repo.beginGeneration(scopeId);
		try {
			let cursor: string | null = begin.cursors.items;
			let downloaded = 0;
			let skipped = 0;
			let sum = 0;
			opts.onProgress?.({ downloaded, total: begin.total });
			while (cursor) {
				const page: Page = await call<Page>("catalog_page", { cursor, limit: PAGE });
				if (page.resync)
					throw new CatalogSyncError(
						"resync",
						`The server asked for a fresh start (${page.resync}).`,
					);
				const mapped = page.items.map((r) => toCatalogItem(r, minorDigits));
				await repo.putBatch(
					scopeId,
					gen,
					mapped.map((m) => m.item),
				);
				for (const r of page.items) sum += crc32(r.item_code);
				skipped += mapped.reduce((n, m) => n + m.skipped, 0);
				downloaded += page.items.length;
				cursor = page.next_cursor;
				opts.onProgress?.({ downloaded, total: Math.max(begin.total, downloaded) });
			}
			const digest = await call<Digest>("catalog_digest", {});
			if (digest.count !== downloaded || Number(digest.checksum) !== sum)
				throw new CatalogSyncError(
					"verify_failed",
					`The catalog changed while downloading (server ${digest.count} items, received ${downloaded}).`,
				);
			await repo.activate(scopeId, gen, downloaded);
			return { items: downloaded, skippedBarcodes: skipped };
		} catch (e) {
			await repo.discard(scopeId, gen).catch(() => undefined); // never leave a half-staged generation behind
			lastError = e;
			if (!(e instanceof CatalogSyncError && e.code === "verify_failed")) throw e; // only a mid-download change is worth retrying
		}
	}
	throw lastError;
}
