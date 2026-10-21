import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { call, isNetworkError } from "@/services/api";
import { usePosStore } from "@/stores/posStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
	cacheItems as idbCacheItems,
	searchCachedItemsPage as idbSearchCachedItemsPage,
	warmCatalogIndex,
	getCachedStockForItems,
	findCachedItem,
	cacheItemGroups as idbCacheGroups,
	getCachedItemGroups as idbGetCachedGroups,
	cacheStockForWarehouse,
	getCachedItemByCode,
	getSyncMeta,
	setSyncMeta,
} from "@/services/dbBridge";
import type {
	POSItem,
	ItemGroup,
	ItemDetail,
	ItemVariant,
	ItemAttribute,
	StockAvailability,
	BundleComponent,
} from "@/types/pos.types";
import { isOnline } from "@/utils";
import { onIdle } from "@/utils/idle";

interface ItemGroupsResult {
	groups: ItemGroup[];
	parent_groups: ItemGroup[];
}

export const useItemStore = defineStore("items", () => {
	const items = shallowRef<POSItem[]>([]);
	const isLoading = ref(false);
	/** Set when the last catalogue fetch failed and no offline cache stood in for it. */
	const loadError = ref<string | null>(null);
	const searchTerm = ref("");
	const selectedGroup = ref("All Item Groups");
	const currentPage = ref(0);
	const pageLength = ref(40);
	const hasMore = ref(true);
	const totalCount = ref(0);
	const itemGroups = ref<ItemGroup[]>([]);
	const parentGroups = ref<ItemGroup[]>([]);

	function offlineSearchFields(): string[] {
		return useSettingsStore().itemSearchFields;
	}

	const showItemDetail = ref(false);
	const resolveLineUid = ref<string | null>(null);
	const selectedItemDetail = ref<ItemDetail | null>(null);
	const selectedItemForDetail = ref<POSItem | null>(null);
	const isLoadingDetail = ref(false);

	const showVariantPicker = ref(false);
	const variants = ref<ItemVariant[]>([]);
	const variantAttributes = ref<ItemAttribute[]>([]);
	const isLoadingVariants = ref(false);

	let cacheRun: Promise<void> | null = null;
	const CACHE_FRESH_MS = 4 * 60 * 1000;
	const STOCK_CHUNK = 5000;

	function cacheAllItems(posProfile: string): Promise<void> {
		if (!usePosStore().useOfflineMode) return Promise.resolve();
		if (cacheRun) return cacheRun;

		const run = refreshCatalogue(posProfile).finally(() => {
			if (cacheRun === run) cacheRun = null;
		});
		cacheRun = run;
		return run;
	}

	async function refreshCatalogue(posProfile: string): Promise<void> {
		const scope = `${posProfile}::${usePosStore().warehouse}`;
		try {
			const [cachedAt, cachedScope] = await Promise.all([
				getSyncMeta("items_cached_at"),
				getSyncMeta("items_cache_scope"),
			]);
			const age = Date.now() - Date.parse(String(cachedAt || ""));
			if (cachedScope === scope && age >= 0 && age < CACHE_FRESH_MS) {
				// Nothing to download, but the search index lives in memory: build it while idle.
				onIdle(() => void warmCatalogIndex(offlineSearchFields()).catch(() => {}));
				return;
			}
		} catch {
			/* no readable cache: download */
		}
		if (await downloadCatalogue(posProfile))
			await setSyncMeta("items_cache_scope", scope).catch(() => {});
	}

	async function downloadCatalogue(posProfile: string): Promise<boolean> {
		try {
			const batchSize = 200;
			let start = 0;
			const allItems: POSItem[] = [];
			let batch: POSItem[];

			do {
				batch = await call<POSItem[]>("xpos.api.items.get_pos_items", {
					pos_profile: posProfile,
					search_term: "",
					item_group: "",
					start,
					page_length: batchSize,
				});
				for (const item of batch) allItems.push(item);
				start += batchSize;
			} while (batch.length === batchSize);

			await idbCacheItems(allItems);

			const posStoreRef = usePosStore();
			const warehouse = posStoreRef.warehouse;
			if (warehouse && allItems.length > 0) {
				await cacheAllStock(posProfile, warehouse, allItems);
			}
			warmCatalogIndex(offlineSearchFields()).catch(() => {});
			return true;
		} catch (error) {
			console.warn("[XPOS Offline] Failed to cache items:", error);
			return false;
		}
	}

	async function cacheAllStock(posProfile: string, warehouse: string, allItems: POSItem[]): Promise<void> {
		if (!isOnline()) {
			console.warn("[XPOS Offline] Cannot cache stock - system is offline");
			return;
		}

		try {
			if (allItems.length === 0) return;

			const stockMap = new Map<string, number>();
			for (let from = 0; from < allItems.length; from += STOCK_CHUNK) {
				const itemCodes = allItems.slice(from, from + STOCK_CHUNK).map((item) => item.item_code);
				const stockResult = await call<StockAvailability[]>("xpos.api.items.get_stock_availability", {
					items: JSON.stringify(itemCodes),
					warehouse,
					pos_profile: posProfile,
				});
				for (const s of stockResult || []) stockMap.set(s.item_code, s.actual_qty || 0);
			}

			const stockEntries = allItems.map((item) => ({
				item_code: item.item_code,
				actual_qty: stockMap.get(item.item_code) ?? 0,
			}));

			await cacheStockForWarehouse(warehouse, stockEntries);
		} catch (error) {
			console.warn("[XPOS Offline] Failed to cache stock:", error);
		}
	}

	let queryGeneration = 0;
	let loadMoreQueued = false;

	async function offlinePage(
		start: number,
	): Promise<{ rows: POSItem[]; hasMore: boolean; cached: boolean }> {
		const page = await idbSearchCachedItemsPage(
			searchTerm.value,
			selectedGroup.value,
			offlineSearchFields(),
			start,
			pageLength.value,
		);
		const warehouse = usePosStore().warehouse;
		let rows = page.items;
		if (warehouse && rows.length > 0) {
			const stock = await getCachedStockForItems(
				warehouse,
				rows.map((item) => item.item_code),
			);
			rows = rows.map((item) => ({
				...item,
				actual_qty: stock.get(item.item_code) ?? item.actual_qty,
			}));
		}
		return { rows, hasMore: page.hasMore, cached: page.total > 0 };
	}

	function showPage(rows: POSItem[], hasMoreRows: boolean, append: boolean): void {
		items.value = append ? items.value.concat(rows) : rows;
		if (!append) currentPage.value = 0;
		hasMore.value = hasMoreRows;
	}

	async function fetchItems(posProfile: string, append = false): Promise<void> {
		if (append) {
			if (isLoading.value) {
				loadMoreQueued = true;
				return;
			}
		} else {
			queryGeneration++;
			loadMoreQueued = false;
		}
		const generation = queryGeneration;
		isLoading.value = true;
		loadError.value = null;

		try {
			const start = append ? items.value.length : 0;

			if (!isOnline() && usePosStore().useOfflineMode) {
				const page = await offlinePage(start);
				if (generation !== queryGeneration) return;
				showPage(page.rows, page.hasMore, append);
				return;
			}

			if (isOnline()) {
				const result = await call<POSItem[]>("xpos.api.items.get_pos_items", {
					pos_profile: posProfile,
					search_term: searchTerm.value,
					item_group: selectedGroup.value === "All Item Groups" ? "" : selectedGroup.value,
					start,
					page_length: pageLength.value,
				});
				if (generation !== queryGeneration) return;

				showPage(result, result.length === pageLength.value, append);

				if (!searchTerm.value && !append && selectedGroup.value === "All Item Groups") {
					if (usePosStore().useOfflineMode) {
						cacheAllItems(posProfile).catch(() => {});
					}
				}
			}
		} catch (error) {
			if (generation !== queryGeneration) return;
			if (usePosStore().useOfflineMode) {
				try {
					const page = await offlinePage(0);
					if (generation !== queryGeneration) return;
					if (page.cached) {
						showPage(page.rows, page.hasMore, false);
						console.log("[XPOS Offline] Serving items from idb cache after fetch failure");
						return;
					}
				} catch {
					/* ignore */
				}
			}
			console.error("Error fetching items:", error);
			loadError.value = error instanceof Error ? error.message : String(error);
		} finally {
			if (generation === queryGeneration) {
				isLoading.value = false;
				if (loadMoreQueued) {
					loadMoreQueued = false;
					if (hasMore.value) void fetchItems(posProfile, true);
				}
			}
		}
	}

	async function fetchItemGroups(): Promise<void> {
		try {
			if (!isOnline() && usePosStore().useOfflineMode) {
				const cached = await idbGetCachedGroups();
				itemGroups.value = cached.groups;
				parentGroups.value = cached.parentGroups;
				return;
			}

			if (isOnline()) {
				const result = await call<ItemGroupsResult>("xpos.api.items.get_item_groups", {
					pos_profile: usePosStore().profileName,
				});
				itemGroups.value = result.groups || [];
				parentGroups.value = result.parent_groups || [];

				if (usePosStore().useOfflineMode) {
					idbCacheGroups(itemGroups.value, parentGroups.value).catch(() => {});
				}
			}
		} catch (error) {
			if (usePosStore().useOfflineMode) {
				try {
					const cached = await idbGetCachedGroups();
					if (cached.groups.length > 0) {
						itemGroups.value = cached.groups;
						parentGroups.value = cached.parentGroups;
						return;
					}
				} catch {
					/* ignore */
				}
			}
			console.error("Error fetching item groups:", error);
		}
	}

	async function searchByBarcode(barcode: string, _posProfile?: string): Promise<POSItem | null> {
		try {
			if (!isOnline()) {
				return (await findCachedItem(barcode)) || null;
			}

			const result = await call<POSItem | null>("xpos.api.items.search_barcode", {
				barcode: barcode,
				pos_profile: _posProfile || "",
			});
			return result;
		} catch (error) {
			try {
				return (await findCachedItem(barcode)) || null;
			} catch {
				/* ignore */
			}
			console.error("Error searching barcode:", error);
			return null;
		}
	}

	async function fetchItemDetail(
		itemCode: string,
		posProfile: string,
		warehouse?: string,
	): Promise<ItemDetail | null> {
		isLoadingDetail.value = true;
		try {
			const result = await call<ItemDetail>("xpos.api.items.get_item_detail", {
				item_code: itemCode,
				pos_profile: posProfile,
				warehouse: warehouse || "",
			});
			selectedItemDetail.value = result;
			return result;
		} catch (error) {
			if (!isNetworkError(error)) {
				console.error("Error fetching item detail:", error);
			}
			try {
				const cached = await getCachedItemByCode(itemCode);
				if (cached) {
					const basicDetail = {
						item_code: cached.item_code,
						item_name: cached.item_name,
						local_item_name: cached.local_item_name,
						description: cached.description || "",
						stock_uom: cached.stock_uom || "Nos",
						image: cached.image || "",
						item_group: cached.item_group || "",
						rate: cached.rate || 0,
						actual_qty: cached.actual_qty || 0,
					} as unknown as ItemDetail;
					selectedItemDetail.value = basicDetail;
					return basicDetail;
				}
			} catch {
				/* ignore cache errors */
			}
			return null;
		} finally {
			isLoadingDetail.value = false;
		}
	}

	async function openItemDetail(
		item: POSItem,
		posProfile: string,
		warehouse?: string,
		lineUid?: string,
	): Promise<void> {
		selectedItemForDetail.value = item;
		resolveLineUid.value = lineUid || null;
		showItemDetail.value = true;
		await fetchItemDetail(item.item_code, posProfile, warehouse);
	}

	function closeItemDetail(): void {
		showItemDetail.value = false;
		resolveLineUid.value = null;
		selectedItemDetail.value = null;
		selectedItemForDetail.value = null;
	}

	async function fetchItemVariants(itemCode: string, posProfile?: string): Promise<ItemVariant[]> {
		isLoadingVariants.value = true;
		try {
			const result = await call<ItemVariant[]>("xpos.api.items.get_item_variants", {
				item_code: itemCode,
				pos_profile: posProfile || "",
			});
			variants.value = result || [];
			return variants.value;
		} catch (error) {
			console.error("Error fetching variants:", error);
			return [];
		} finally {
			isLoadingVariants.value = false;
		}
	}

	async function fetchItemAttributes(itemCode: string): Promise<ItemAttribute[]> {
		try {
			const result = await call<ItemAttribute[]>("xpos.api.items.get_item_attributes", {
				item_code: itemCode,
			});
			variantAttributes.value = result || [];
			return variantAttributes.value;
		} catch (error) {
			console.error("Error fetching attributes:", error);
			return [];
		}
	}

	async function openVariantPicker(item: POSItem, posProfile?: string): Promise<void> {
		selectedItemForDetail.value = item;
		showVariantPicker.value = true;
		await Promise.all([
			fetchItemVariants(item.item_code, posProfile),
			fetchItemAttributes(item.item_code),
		]);
	}

	function closeVariantPicker(): void {
		showVariantPicker.value = false;
		variants.value = [];
		variantAttributes.value = [];
	}

	async function fetchStockAvailability(
		itemCodes: string[],
		warehouse: string,
	): Promise<StockAvailability[]> {
		try {
			const posStoreRef = usePosStore();
			const result = await call<StockAvailability[]>("xpos.api.items.get_stock_availability", {
				items: JSON.stringify(itemCodes),
				warehouse,
				pos_profile: posStoreRef.profileName || undefined,
			});
			return result || [];
		} catch (error) {
			console.error("Error fetching stock:", error);
			return [];
		}
	}

	async function fetchPriceForUOM(itemCode: string, uom: string, posProfile: string): Promise<number> {
		try {
			const result = await call<{ rate: number }>("xpos.api.items.get_price_for_uom", {
				item_code: itemCode,
				uom,
				pos_profile: posProfile,
			});
			return result?.rate || 0;
		} catch (error) {
			console.error("Error fetching UOM price:", error);
			return 0;
		}
	}

	async function fetchBundleComponents(itemCode: string): Promise<BundleComponent[]> {
		try {
			const result = await call<BundleComponent[]>("xpos.api.bundles.get_bundle_components", {
				item_code: itemCode,
			});
			return result || [];
		} catch (error) {
			console.error("Error fetching bundle components:", error);
			return [];
		}
	}

	function setSearchTerm(term: string): void {
		searchTerm.value = term;
	}

	function setSelectedGroup(group: string): void {
		selectedGroup.value = group;
	}

	function loadMore(posProfile: string): void {
		if (hasMore.value && !isLoading.value) {
			fetchItems(posProfile, true);
		}
	}

	function resetItems(): void {
		items.value = [];
		searchTerm.value = "";
		selectedGroup.value = "All Item Groups";
		currentPage.value = 0;
		hasMore.value = true;
	}

	return {
		items,
		isLoading,
		loadError,
		searchTerm,
		selectedGroup,
		currentPage,
		hasMore,
		totalCount,
		itemGroups,
		parentGroups,
		showItemDetail,
		resolveLineUid,
		selectedItemDetail,
		selectedItemForDetail,
		isLoadingDetail,
		showVariantPicker,
		variants,
		variantAttributes,
		isLoadingVariants,
		fetchItems,
		fetchItemGroups,
		searchByBarcode,
		fetchItemDetail,
		openItemDetail,
		closeItemDetail,
		fetchItemVariants,
		fetchItemAttributes,
		openVariantPicker,
		closeVariantPicker,
		fetchStockAvailability,
		fetchPriceForUOM,
		fetchBundleComponents,
		cacheAllItems,
		cacheAllStock,
		setSearchTerm,
		setSelectedGroup,
		loadMore,
		resetItems,
	};
});
