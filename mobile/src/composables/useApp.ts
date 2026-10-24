import { reactive, readonly } from "vue";
import type { BootstrapInfo, Enrolled, Lifecycle } from "@mobile/ports";
import { createContainer, NotAndroidError, type Container } from "@mobile/app/container";
import { createLifecycle } from "@mobile/app/lifecycle";
import { CatalogSyncError, downloadCatalog } from "@mobile/app/catalogSync";
import { OfflineError, SessionExpiredError } from "@mobile/adapters/frappeHttp";

export type Phase = "booting" | "unsupported" | "setup" | "login" | "enroll" | "locked" | "unlocked";
export type Tab = "sell" | "diagnostics";

const ORIGIN_KEY = "xpos-mobile-origin";
/** The origin is not a secret; it is the one thing remembered about the server (never the WebView host). */
function loadOrigin(): string | null {
	try {
		return localStorage.getItem(ORIGIN_KEY);
	} catch {
		return null;
	}
}
function saveOrigin(o: string | null) {
	try {
		if (o) localStorage.setItem(ORIGIN_KEY, o);
		else localStorage.removeItem(ORIGIN_KEY);
	} catch {
		/* preference only */
	}
}

export const AUTO_LOCK_MS = 30_000;
/** A catalog older than this is refreshed on unlock when the server is reachable. */
export const CATALOG_STALE_MS = 60 * 60 * 1000;

export interface CatalogStatus {
	scopeId: string;
	/** A usable catalog is on the device (it keeps working offline). */
	ready: boolean;
	items: number;
	syncing: boolean;
	downloaded: number;
	total: number;
	/** Plain-language state for the cashier: why there is no catalog, or why the refresh failed. */
	message: string;
	syncedAt: number | null;
	skippedBarcodes: number;
}

const emptyCatalog = (): CatalogStatus => ({
	scopeId: "",
	ready: false,
	items: 0,
	syncing: false,
	downloaded: 0,
	total: 0,
	message: "",
	syncedAt: null,
	skippedBarcodes: 0,
});

const state = reactive({
	phase: "booting" as Phase,
	tab: "sell" as Tab,
	origin: loadOrigin(),
	pending: null as BootstrapInfo | null,
	cashier: null as Enrolled | null,
	lockReason: "",
	catalog: emptyCatalog(),
});

let container: Container;
let lifecycle: Lifecycle;
let hiddenAt = 0;

export function getContainer(): Container {
	return (container ??= createContainer());
}
export function getLifecycle(): Lifecycle {
	return (lifecycle ??= createLifecycle());
}

/** One scope per cashier, profile and server: the catalog depends on the user's permissions and profile. */
export function scopeIdFor(e: Enrolled): string {
	return `real:${e.user}|${e.profile}@${new URL(e.site).host}`;
}

export async function boot(): Promise<void> {
	let c: Container;
	try {
		c = getContainer();
	} catch (e) {
		if (e instanceof NotAndroidError) {
			state.phase = "unsupported";
			return;
		}
		throw e;
	}
	const lc = getLifecycle();
	lc.onBackground(() => {
		hiddenAt = Date.now();
	});
	lc.onForeground(() => {
		if (state.phase === "unlocked" && hiddenAt && Date.now() - hiddenAt >= AUTO_LOCK_MS)
			void lock("Locked after the app was in the background");
		hiddenAt = 0;
	});
	const enrolled = await c.auth.enrolled();
	state.cashier = enrolled;
	state.phase = enrolled ? "locked" : "setup";
}

const syncedKey = (scopeId: string) => `xpos-mobile-synced:${scopeId}`;
function readSyncedAt(scopeId: string): number | null {
	try {
		const v = Number(localStorage.getItem(syncedKey(scopeId)));
		return v > 0 ? v : null;
	} catch {
		return null;
	}
}
function writeSyncedAt(scopeId: string, at: number) {
	try {
		localStorage.setItem(syncedKey(scopeId), String(at));
	} catch {
		/* informational only */
	}
}

/** Reads what is on the device; refreshes from the server when there is none or it is stale (and we are online). */
export async function startCatalog(): Promise<void> {
	const e = state.cashier;
	if (!e) return;
	const scopeId = scopeIdFor(e);
	const c = getContainer();
	const cat = state.catalog;
	if (cat.scopeId !== scopeId) Object.assign(cat, emptyCatalog(), { scopeId });
	const mine = (await c.catalog.listScopes()).find((s) => s.scopeId === scopeId);
	if (mine?.activeGen != null) {
		cat.ready = true;
		cat.items = (await c.catalog.stats(scopeId)).items;
		cat.syncedAt = readSyncedAt(scopeId);
	}
	const stale = !cat.syncedAt || Date.now() - cat.syncedAt > CATALOG_STALE_MS;
	if (!cat.ready || stale) {
		if (getLifecycle().isOnline()) await refreshCatalog();
		else if (!cat.ready)
			cat.message = "No catalog on this device yet. Connect to the server to download it.";
	}
}

export async function refreshCatalog(): Promise<void> {
	const e = state.cashier;
	const cat = state.catalog;
	if (!e || cat.syncing) return;
	const c = getContainer();
	cat.syncing = true;
	cat.message = "";
	cat.downloaded = 0;
	try {
		const api = await c.session(e.site);
		const r = await downloadCatalog({
			api,
			repo: c.catalog,
			scopeId: cat.scopeId,
			site: e.site,
			profile: e.profile,
			minorDigits: e.minorDigits,
			onProgress: (p) => Object.assign(cat, { downloaded: p.downloaded, total: p.total }),
		});
		cat.ready = true;
		cat.items = r.items;
		cat.skippedBarcodes = r.skippedBarcodes;
		cat.syncedAt = Date.now();
		writeSyncedAt(cat.scopeId, cat.syncedAt);
	} catch (err) {
		const have = cat.ready ? " The catalog from the last download is still available." : "";
		cat.message =
			err instanceof OfflineError
				? "The server cannot be reached." + have
				: err instanceof SessionExpiredError
					? "Your server session has expired. Sign out and sign in again to refresh the catalog." +
						have
					: err instanceof CatalogSyncError
						? err.message + have
						: "The catalog could not be downloaded." + have;
	} finally {
		cat.syncing = false;
	}
}

export async function lock(reason = ""): Promise<void> {
	await getContainer().auth.lock();
	state.lockReason = reason;
	state.phase = "locked";
}

export function setOrigin(origin: string): void {
	state.origin = origin;
	saveOrigin(origin);
	state.phase = "login";
}
export function changeServer(): void {
	state.phase = "setup";
}
export function loggedIn(info: BootstrapInfo): void {
	state.pending = info;
	state.phase = "enroll";
}
export async function enrolled(): Promise<void> {
	state.cashier = await getContainer().auth.enrolled();
	state.pending = null;
	state.phase = "unlocked";
	await startCatalog();
}
export async function unlocked(): Promise<void> {
	state.lockReason = "";
	state.phase = "unlocked";
	await startCatalog();
}
export async function signOut(): Promise<void> {
	await getContainer().auth.signOut();
	state.cashier = null;
	state.catalog = emptyCatalog();
	state.phase = "setup";
}
export function selectTab(t: Tab) {
	state.tab = t;
}

export const useApp = () => ({ state: readonly(state) });
