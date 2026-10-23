import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { call } from "@/services/api";
import { getCachedItemByCode, getSyncMeta, setSyncMeta } from "@/services/dbBridge";
import {
	builtinLayout,
	defaultPolicy,
	deviceClassFor,
	effectiveLayout,
	emptyPersonal,
	layoutCacheKey,
	migrate,
	personalFromEdit,
	sanitize,
	type DeviceClass,
	type Layout,
	type LayoutPolicy,
	type PersonalLayout,
} from "@/services/posLayout";
import { isNetworkError, isOnline } from "@/utils";
import type { POSItem } from "@/types/pos.types";

export interface LayoutPayload {
	pos_profile: string;
	company: string;
	revision: number;
	recovered: boolean;
	policy: LayoutPolicy;
	defaults: Layout;
	personal: PersonalLayout;
	layout: Layout;
}

interface SaveResult extends LayoutPayload {
	status: "saved" | "conflict" | "reset";
}

interface Pending {
	personal: PersonalLayout;
	baseRevision: number;
	reset: boolean;
}

export interface Scope {
	user: string;
	company: string;
	profile: string;
}

const AUTOSAVE_NOTE = "xpos-layout";

function host(): string {
	return typeof location !== "undefined" ? location.host : "";
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

export const useLayoutStore = defineStore("layout", () => {
	const scope = ref<Scope | null>(null);
	const payload = ref<LayoutPayload | null>(null);
	const draft = ref<Layout | null>(null);
	const customizing = ref(false);
	const deviceClass = ref<DeviceClass>(
		deviceClassFor(typeof window !== "undefined" ? window.innerWidth : 1280),
	);
	const pending = ref<Pending | null>(null);
	const conflict = ref<LayoutPayload | null>(null);
	const saving = ref(false);
	const error = ref("");
	const recovered = ref(false);
	const pinnedItems = ref<POSItem[]>([]);
	const itemInfo = ref<Record<string, POSItem>>({});
	let loadToken = 0;

	const policy = computed<LayoutPolicy>(() => payload.value?.policy ?? defaultPolicy());
	const defaults = computed<Layout>(() => payload.value?.defaults ?? builtinLayout());
	const personal = computed<PersonalLayout>(() => payload.value?.personal ?? emptyPersonal());
	const saved = computed<Layout>(() => payload.value?.layout ?? builtinLayout());
	/** What the screen shows: the draft while customizing (live preview), else the saved layout. */
	const layout = computed<Layout>(() => (customizing.value && draft.value ? draft.value : saved.value));
	const shared = computed(() => layout.value.shared);
	const device = computed(() => layout.value.device[deviceClass.value]);
	const canCustomize = computed(() => policy.value.allow_customization && !!scope.value);
	const pendingSync = computed(() => pending.value !== null);
	const dirty = computed(
		() =>
			customizing.value && !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(saved.value),
	);

	function cacheKey(target: Scope | null = scope.value): string {
		return target ? layoutCacheKey(host(), target.user, target.company, target.profile) : "";
	}

	async function writeCache(): Promise<void> {
		const key = cacheKey();
		if (!key) return;
		try {
			await setSyncMeta(`${AUTOSAVE_NOTE}:${key}`, JSON.stringify(payload.value));
			await setSyncMeta(`${AUTOSAVE_NOTE}-pending:${key}`, JSON.stringify(pending.value));
		} catch {
			/* the cache is a convenience; the server copy is the source of truth */
		}
	}

	async function readCache(target: Scope): Promise<void> {
		const key = cacheKey(target);
		try {
			const raw = await getSyncMeta(`${AUTOSAVE_NOTE}:${key}`);
			const parsed = typeof raw === "string" ? (JSON.parse(raw) as LayoutPayload | null) : null;
			if (parsed && parsed.pos_profile === target.profile) {
				const pol = { ...defaultPolicy(), ...parsed.policy };
				const clean = sanitize(migrate(parsed.personal).layout, pol);
				payload.value = { ...parsed, policy: pol, personal: clean };
			}
			const rawPending = await getSyncMeta(`${AUTOSAVE_NOTE}-pending:${key}`);
			const waiting =
				typeof rawPending === "string" ? (JSON.parse(rawPending) as Pending | null) : null;
			pending.value = waiting && typeof waiting === "object" ? waiting : null;
		} catch {
			/* corrupt cache: fall back to defaults until the server answers */
			payload.value = null;
			pending.value = null;
		}
	}

	function adopt(next: LayoutPayload): void {
		payload.value = next;
		recovered.value = next.recovered;
	}

	async function resolvePinned(): Promise<void> {
		const codes = (customizing.value && draft.value ? draft.value : saved.value).shared.pinnedItems;
		if (!codes.length) {
			pinnedItems.value = [];
			return;
		}
		const found: POSItem[] = [];
		if (isOnline() && !customizing.value) {
			try {
				const rows = await call<POSItem[]>("xpos.api.pos_preferences.get_pinned_items", {
					pos_profile: scope.value?.profile,
				});
				for (const row of rows) itemInfo.value[row.item_code] = row;
				pinnedItems.value = rows;
				return;
			} catch {
				/* fall through to the offline catalogue */
			}
		}
		for (const code of codes) {
			const row = itemInfo.value[code] ?? (await getCachedItemByCode(code).catch(() => undefined));
			if (row) {
				itemInfo.value[code] = row;
				found.push(row);
			}
		}
		pinnedItems.value = found;
	}

	async function load(target: Scope): Promise<void> {
		const token = ++loadToken;
		scope.value = target;
		customizing.value = false;
		draft.value = null;
		conflict.value = null;
		payload.value = null;
		pending.value = null;
		pinnedItems.value = [];
		await readCache(target);
		if (token !== loadToken) return;
		void resolvePinned();
		if (!isOnline()) return;
		try {
			if (pending.value) await flush();
			const fresh = await call<LayoutPayload>("xpos.api.pos_preferences.get_layout", {
				pos_profile: target.profile,
			});
			if (token !== loadToken) return;
			if (!pending.value) {
				adopt(fresh);
				await writeCache();
			}
			await resolvePinned();
		} catch (err) {
			if (!isNetworkError(err)) error.value = err instanceof Error ? err.message : String(err);
		}
	}

	function clear(): void {
		loadToken++;
		scope.value = null;
		payload.value = null;
		draft.value = null;
		customizing.value = false;
		pending.value = null;
		conflict.value = null;
		pinnedItems.value = [];
		itemInfo.value = {};
	}

	function setDeviceClass(next: DeviceClass): void {
		deviceClass.value = next;
	}

	function startCustomize(): void {
		if (!canCustomize.value) return;
		draft.value = clone(saved.value);
		customizing.value = true;
		error.value = "";
	}

	function cancelCustomize(): void {
		customizing.value = false;
		draft.value = null;
		void resolvePinned();
	}

	function localApply(next: PersonalLayout, baseRevision: number): void {
		if (!payload.value) return;
		const resolved = effectiveLayout(next, payload.value.defaults, payload.value.policy);
		payload.value = { ...payload.value, personal: next, layout: resolved, revision: baseRevision };
	}

	async function flush(): Promise<void> {
		const waiting = pending.value;
		const target = scope.value;
		if (!waiting || !target || !isOnline()) return;
		const result = waiting.reset
			? await call<SaveResult>("xpos.api.pos_preferences.reset_layout", { pos_profile: target.profile })
			: await call<SaveResult>("xpos.api.pos_preferences.save_layout", {
					pos_profile: target.profile,
					layout: JSON.stringify(waiting.personal),
					base_revision: waiting.baseRevision,
				});
		if (result.status === "conflict") {
			conflict.value = result;
			return;
		}
		pending.value = null;
		adopt(result);
		await writeCache();
		await resolvePinned();
	}

	/** Save the draft. Online it goes to the server; offline it is kept and sent on reconnect. */
	async function save(): Promise<boolean> {
		if (!draft.value || !payload.value || !scope.value) return false;
		saving.value = true;
		error.value = "";
		const next = personalFromEdit(
			personal.value,
			saved.value,
			draft.value,
			deviceClass.value,
			policy.value,
		);
		const base = payload.value.revision;
		try {
			if (!isOnline()) throw new Error("__offline__");
			const result = await call<SaveResult>("xpos.api.pos_preferences.save_layout", {
				pos_profile: scope.value.profile,
				layout: JSON.stringify(next),
				base_revision: base,
			});
			if (result.status === "conflict") {
				pending.value = { personal: next, baseRevision: base, reset: false };
				conflict.value = result;
				return false;
			}
			pending.value = null;
			adopt(result);
		} catch (err) {
			if (!isNetworkError(err)) {
				error.value = err instanceof Error ? err.message : String(err);
				return false;
			}
			pending.value = { personal: next, baseRevision: base, reset: false };
			localApply(next, base);
		} finally {
			saving.value = false;
		}
		customizing.value = false;
		draft.value = null;
		await writeCache();
		await resolvePinned();
		return true;
	}

	async function reset(): Promise<boolean> {
		if (!scope.value || !payload.value) return false;
		saving.value = true;
		error.value = "";
		try {
			if (!isOnline()) throw new Error("__offline__");
			const result = await call<SaveResult>("xpos.api.pos_preferences.reset_layout", {
				pos_profile: scope.value.profile,
			});
			pending.value = null;
			adopt(result);
		} catch (err) {
			if (!isNetworkError(err)) {
				error.value = err instanceof Error ? err.message : String(err);
				return false;
			}
			pending.value = { personal: emptyPersonal(), baseRevision: payload.value.revision, reset: true };
			localApply(emptyPersonal(), payload.value.revision);
		} finally {
			saving.value = false;
		}
		customizing.value = false;
		draft.value = null;
		await writeCache();
		await resolvePinned();
		return true;
	}

	/** Conflict answer "keep mine": resend my edit on top of the server's newer revision. */
	async function keepMine(): Promise<void> {
		const theirs = conflict.value;
		const mine = pending.value;
		if (!theirs || !mine) return;
		conflict.value = null;
		pending.value = { ...mine, baseRevision: theirs.revision };
		payload.value = theirs;
		await flush();
	}

	/** Conflict answer "use theirs": drop my edit and take what the server has. */
	async function useTheirs(): Promise<void> {
		const theirs = conflict.value;
		if (!theirs) return;
		conflict.value = null;
		pending.value = null;
		adopt(theirs);
		customizing.value = false;
		draft.value = null;
		await writeCache();
		await resolvePinned();
	}

	async function syncPending(): Promise<void> {
		if (!pending.value || conflict.value) return;
		try {
			await flush();
		} catch {
			/* still offline or the server is busy; try again at the next reconnect */
		}
	}

	return {
		scope,
		payload,
		draft,
		customizing,
		deviceClass,
		pending,
		conflict,
		saving,
		error,
		recovered,
		pinnedItems,
		itemInfo,
		policy,
		defaults,
		personal,
		saved,
		layout,
		shared,
		device,
		canCustomize,
		pendingSync,
		dirty,
		load,
		clear,
		setDeviceClass,
		startCustomize,
		cancelCustomize,
		save,
		reset,
		keepMine,
		useTheirs,
		syncPending,
		resolvePinned,
	};
});
