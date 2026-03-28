<template>
	<div class="flex h-full overflow-hidden">
		<div
			class="flex-1 flex flex-col min-w-0 border-e border-border bg-background max-w-[calc(100%-560px)] xl:max-w-[calc(100%-520px)]"
		>
			<div class="shrink-0 p-4 pb-2 space-y-3">
				<div class="flex items-center gap-2">
					<div class="flex-1">
						<SearchBar
							ref="searchBarRef"
							@search="onSearch"
							@enter="onSearchEnter"
							@navigate="onNavigate"
						/>
					</div>
					<div class="w-52 shrink-0">
						<BarcodeScanner ref="barcodeScannerRef" @scanned="onBarcodeScan" />
					</div>
					<div class="flex items-center gap-1 border rounded-lg p-1">
						<Button
							:variant="viewMode === 'grid' ? 'default' : 'ghost'"
							size="icon"
							class="h-8 w-8"
							@click="viewMode = 'grid'"
						>
							<LayoutGrid class="h-4 w-4" />
						</Button>
						<Button
							:variant="viewMode === 'list' ? 'default' : 'ghost'"
							size="icon"
							class="h-8 w-8"
							@click="viewMode = 'list'"
						>
							<List class="h-4 w-4" />
						</Button>
					</div>
				</div>
				<div class="flex items-center gap-2 overflow-x-auto pb-1 xpos-scrollbar">
					<Autocomplete
						:model-value="itemStore.selectedGroup"
						:options="groupAutocompleteOptions"
						:placeholder="__('Search item groups...')"
						:show-search-icon="true"
						:max-visible="12"
						empty-text="__('No groups found')"
						class="w-52 shrink-0 mt-2"
						@update:model-value="selectGroup($event)"
					/>
					<Button
						:variant="itemStore.selectedGroup === 'All Item Groups' ? 'default' : 'outline'"
						size="sm"
						class="rounded-full shrink-0"
						@click="selectGroup('All Item Groups')"
					>
						{{ __("All Groups") }}
					</Button>
					<Button
						v-for="group in topGroups"
						:key="group.name"
						:variant="itemStore.selectedGroup === group.name ? 'default' : 'outline'"
						size="sm"
						class="rounded-full shrink-0"
						@click="selectGroup(group.name)"
					>
						{{ __(group.name) }}
					</Button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto p-4 pt-2 xpos-scrollbar">
				<ItemGrid
					:items="itemStore.items"
					:is-loading="itemStore.isLoading"
					:currency-symbol="posStore.currencySymbol"
					:view-mode="viewMode"
					:highlighted-index="highlightedIndex"
					@select-item="handleAddItem"
					@show-detail="handleShowDetail"
					@load-more="handleLoadMore"
				/>
			</div>
		</div>

		<div class="w-[560px] xl:w-[520px] flex flex-col bg-background dark:bg-card shrink-0">
			<Cart />
		</div>

		<CommandSearch
			ref="commandSearchRef"
			:pos-profile="posStore.profileName"
			:currency-symbol="posStore.currencySymbol"
			@select-item="handleAddItem"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { useCartStore } from "@/stores/cartStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showError, isNetworkError } from "@/services/api";
import { cacheItemTax, getCachedItemTax } from "@/services/dbBridge";
import SearchBar from "@/components/items/SearchBar.vue";
import BarcodeScanner from "@/components/items/BarcodeScanner.vue";
import ItemGrid from "@/components/items/ItemGrid.vue";
import CommandSearch from "@/components/items/CommandSearch.vue";
import Cart from "@/components/cart/Cart.vue";
import { Button } from "@/components/ui/button";
import { Autocomplete } from "@/components/ui/autocomplete";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { LayoutGrid, List, Search } from "lucide-vue-next";

import type { POSItem } from "@/types/pos.types";
import __ from "@/lib/translate";

const posStore = usePosStore();
const itemStore = useItemStore();
const cartStore = useCartStore();
const offerStore = useOfferStore();

const viewMode = ref<"grid" | "list">("grid");

watch(
	() => posStore.defaultView,
	(defaultView) => {
		if (defaultView) {
			viewMode.value = defaultView.toLowerCase() === "list" ? "list" : "grid";
		}
	},
	{ immediate: true },
);

const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);
const barcodeScannerRef = ref<InstanceType<typeof BarcodeScanner> | null>(null);
const commandSearchRef = ref<InstanceType<typeof CommandSearch> | null>(null);
const highlightedIndex = ref(-1);

const topGroups = computed(() => {
	const groups = itemStore.parentGroups.filter((g) => g.name !== "All Item Groups");
	return groups.slice(0, 12);
});

const groupAutocompleteOptions = computed(() => {
	const allOption = { label: __("All Groups"), value: "All Item Groups" };
	const groupOptions = itemStore.parentGroups
		.filter((g) => g.name !== "All Item Groups")
		.map((g) => ({ label: __(g.name), value: g.name }));
	return [allOption, ...groupOptions];
});

onMounted(() => {
	if (posStore.isReady) {
		loadInitialData();
	}
	document.addEventListener("keydown", handleGlobalKeydown);
	window.addEventListener("xpos:toggle-view", handleToggleView as EventListener);
	window.addEventListener("xpos:focus-barcode", handleFocusBarcode as EventListener);
	window.addEventListener("xpos:focus-search", handleFocusSearch as EventListener);
	window.addEventListener("xpos:open-command-search", handleOpenCommandSearch as EventListener);
	nextTick(() => barcodeScannerRef.value?.focus());
});

onUnmounted(() => {
	document.removeEventListener("keydown", handleGlobalKeydown);
	window.removeEventListener("xpos:toggle-view", handleToggleView as EventListener);
	window.removeEventListener("xpos:focus-barcode", handleFocusBarcode as EventListener);
	window.removeEventListener("xpos:focus-search", handleFocusSearch as EventListener);
	window.removeEventListener("xpos:open-command-search", handleOpenCommandSearch as EventListener);
});

function handleToggleView() {
	viewMode.value = viewMode.value === "grid" ? "list" : "grid";
}

function handleFocusBarcode() {
	barcodeScannerRef.value?.focus();
}

function handleFocusSearch() {
	searchBarRef.value?.focus();
}

function handleOpenCommandSearch() {
	commandSearchRef.value?.open();
}

watch(
	() => posStore.isReady,
	(ready) => {
		if (ready) loadInitialData();
	},
);

watch(
	() => itemStore.items,
	() => {
		highlightedIndex.value = -1;
	},
);

watch(
	() => itemStore.showItemDetail,
	(open) => {
		if (!open && highlightedIndex.value >= 0) {
			nextTick(() => {
				searchBarRef.value?.focus();
				const el = document.querySelector(`[data-item-index="${highlightedIndex.value}"]`);
				el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
			});
		}
	},
);

async function loadInitialData() {
	await Promise.all([itemStore.fetchItems(posStore.profileName), itemStore.fetchItemGroups()]);

	nextTick(() => barcodeScannerRef.value?.focus());
}

function onSearch(term: string) {
	itemStore.setSearchTerm(term);
	itemStore.fetchItems(posStore.profileName);
}

async function onSearchEnter(val: string) {
	if (highlightedIndex.value >= 0 && highlightedIndex.value < itemStore.items.length) {
		handleShowDetail(itemStore.items[highlightedIndex.value]);
		return;
	}

	if (!val) return;

	onSearch(val);
}

async function onBarcodeScan(barcode: string) {
	if (!barcode) return;

	barcodeScannerRef.value?.setScanning(true);
	try {
		const result = await itemStore.searchByBarcode(barcode, posStore.profileName);
		if (result) {
			handleAddItem({
				item_code: result.item_code,
				item_name: result.item_name,
				rate: result.rate || 0,
				stock_uom: result.stock_uom || result.uom,
				uom: result.uom,
				image: result.image,
				has_batch_no: result.has_batch_no,
				has_serial_no: result.has_serial_no,
				actual_qty: result.actual_qty ?? 9999,
			} as POSItem);
			barcodeScannerRef.value?.showSuccess();
		} else {
			showError(__(`Item not found for barcode: ${barcode}`));
			barcodeScannerRef.value?.showError();
		}
	} catch (err) {
		showError(__("Barcode lookup failed"));
		barcodeScannerRef.value?.showError();
	} finally {
		barcodeScannerRef.value?.setScanning(false);
	}
}

function onNavigate(direction: "up" | "down") {
	const items = itemStore.items;
	if (items.length === 0) return;

	if (direction === "down") {
		highlightedIndex.value = Math.min(highlightedIndex.value + 1, items.length - 1);
	} else {
		highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1);
		if (highlightedIndex.value === -1) {
			searchBarRef.value?.focus();
		}
	}

	nextTick(() => {
		const el = document.querySelector(`[data-item-index="${highlightedIndex.value}"]`);
		el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	});
}

function handleGlobalKeydown(e: KeyboardEvent) {
	const tag = (document.activeElement?.tagName || "").toLowerCase();
	const isInput = tag === "input" || tag === "textarea" || tag === "select";
	const isInDialog = document.activeElement?.closest("[role='dialog']");

	if (e.key === "F1") {
		e.preventDefault();
		barcodeScannerRef.value?.focus();
		return;
	}
	if (e.key === "F2") {
		e.preventDefault();
		searchBarRef.value?.focus();
		return;
	}
	if (e.key === "F5") {
		e.preventDefault();
		viewMode.value = viewMode.value === "grid" ? "list" : "grid";
		return;
	}

	if (isInput) return;
	if (isInDialog) return;

	if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		searchBarRef.value?.setValue(e.key);
		searchBarRef.value?.focus();
		itemStore.setSearchTerm(e.key);
		itemStore.fetchItems(posStore.profileName);
		return;
	}

	if (e.key === "ArrowDown") {
		e.preventDefault();
		onNavigate("down");
	}
	if (e.key === "ArrowUp") {
		e.preventDefault();
		onNavigate("up");
	}

	if (e.key === "Enter" && highlightedIndex.value >= 0) {
		e.preventDefault();
		const item = itemStore.items[highlightedIndex.value];
		if (item) {
			handleShowDetail(item);
		}
	}
}

function selectGroup(group: string) {
	itemStore.setSelectedGroup(group);
	itemStore.fetchItems(posStore.profileName);
}

function handleAddItem(item: POSItem) {
	if (!cartStore.customer) {
		showError(__("Please select a customer before adding items to the cart"));
		return;
	}

	if (item.has_variants && !posStore.hideVariantsItems) {
		itemStore.openVariantPicker(item, posStore.profileName);
		return;
	}

	if (posStore.inputQty) {
		handleShowDetail(item);
		return;
	}

	const result = cartStore.addItem(item);
	if (!result.success) {
		showError(result.message || __("Cannot add item to cart"));
		return;
	}
	fetchAndApplyItemTax(item);

	if (posStore.fetchCoupon) {
		offerStore
			.fetchOffers(
				posStore.profileName,
				cartStore.items.map((i) => i.item_code),
				cartStore.customer?.name || "",
			)
			.then((offers) => {
				if (offers && offers.length > 0) {
					for (const offer of offers) {
						if ((offer as Record<string, unknown>).auto) {
							cartStore.applyOffer(offer);
						}
					}
				}
			})
			.catch(() => {
				/* ignore */
			});
	}
}

async function fetchAndApplyItemTax(item: POSItem) {
	try {
		const taxData = await call<{
			item_tax_template: string | null;
			item_tax_map: Record<string, number>;
		}>("xpos.api.taxes.get_item_tax_template", {
			item_code: item.item_code,
			company: posStore.companyName,
			tax_category: "",
		});
		if (taxData && taxData.item_tax_template) {
			cartStore.setItemTax(item.item_code, taxData.item_tax_template, taxData.item_tax_map || {});

			cacheItemTax(item.item_code, posStore.companyName, {
				item_tax_template: taxData.item_tax_template,
				item_tax_map: taxData.item_tax_map || {},
			}).catch(() => {});
		}
	} catch (e) {
		if (isNetworkError(e)) {
			try {
				const cached = await getCachedItemTax(item.item_code, posStore.companyName);
				if (cached && cached.item_tax_template) {
					cartStore.setItemTax(item.item_code, cached.item_tax_template, cached.item_tax_map || {});
					return;
				}
			} catch {
				/* ignore cache errors */
			}
		}
		console.warn("Failed to fetch item tax template for", item.item_code, e);
	}
}

function handleShowDetail(item: POSItem) {
	itemStore.openItemDetail(item, posStore.profileName);
}

function handleLoadMore() {
	itemStore.loadMore(posStore.profileName);
}
</script>
