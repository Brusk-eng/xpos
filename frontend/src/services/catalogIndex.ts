/**
 * In-memory search index over the cached catalogue.
 *
 * It answers what the offline product search used to answer by reading every item from IndexedDB
 * and filtering in JavaScript, with the same results in the same order:
 *  - a term matches when it is a case-insensitive substring of any configured field (the field
 *    called "name" is the item code) or of the barcode;
 *  - rows come back in item_code order, which is IndexedDB's primary-key order;
 *  - a group filter is an exact match on item_group.
 *
 * The index holds one lower-cased string per item rather than copies of the items, scans it in
 * order and stops as soon as the requested page (plus one, to know whether more exist) is found.
 * It does not import Vue, Dexie or any store, so it can run on the main thread or in a worker.
 */

export interface CatalogRow {
	item_code: string;
	item_group?: string;
	barcode?: string;
	[field: string]: unknown;
}

export interface CatalogSearch {
	term: string;
	group?: string;
	offset?: number;
	limit: number;
}

export interface CatalogPage {
	codes: string[];
	hasMore: boolean;
}

export interface CatalogIndex {
	readonly size: number;
	lookup(value: string): string | undefined;
	search(query: CatalogSearch): CatalogPage;
}

const SEPARATOR = "\u0000";
const ALL_GROUPS = "All Item Groups";

export function buildCatalogIndex(rows: readonly CatalogRow[], fields: readonly string[]): CatalogIndex {
	const columns = fields.map((field) => (field === "name" ? "item_code" : field));
	const sorted = [...rows].sort((a, b) =>
		a.item_code < b.item_code ? -1 : a.item_code > b.item_code ? 1 : 0,
	);

	const codes = new Array<string>(sorted.length);
	const groups = new Array<string | undefined>(sorted.length);
	const haystacks = new Array<string>(sorted.length);
	const exact = new Map<string, number>();

	for (let i = 0; i < sorted.length; i++) {
		const row = sorted[i];
		codes[i] = row.item_code;
		groups[i] = row.item_group;

		const parts: string[] = [];
		for (const column of columns) {
			const value = row[column];
			parts.push(typeof value === "string" ? value.toLowerCase() : "");
		}
		parts.push(row.barcode ? row.barcode.toLowerCase() : "");
		haystacks[i] = parts.join(SEPARATOR);

		const code = row.item_code.toLowerCase();
		if (!exact.has(code)) exact.set(code, i);
		if (row.barcode) {
			const barcode = row.barcode.toLowerCase();
			if (!exact.has(barcode)) exact.set(barcode, i);
		}
	}

	return {
		size: sorted.length,

		lookup(value) {
			const at = exact.get(value.toLowerCase());
			return at === undefined ? undefined : codes[at];
		},

		search({ term, group, offset = 0, limit }) {
			const needle = term.toLowerCase();
			if (needle.includes(SEPARATOR)) return { codes: [], hasMore: false };
			const byGroup = !!group && group !== ALL_GROUPS;
			const found: string[] = [];
			let skipped = 0;

			for (let i = 0; i < codes.length; i++) {
				if (byGroup && groups[i] !== group) continue;
				if (needle && !haystacks[i].includes(needle)) continue;
				if (skipped < offset) {
					skipped++;
					continue;
				}
				if (found.length === limit) return { codes: found, hasMore: true };
				found.push(codes[i]);
			}
			return { codes: found, hasMore: false };
		},
	};
}
