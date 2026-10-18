<template>
	<div :aria-busy="isLoading || undefined">
		<template v-if="isLoading && items.length === 0">
			<div v-if="viewMode === 'grid'" :class="gridClass" data-testid="items-loading">
				<div v-for="i in 12" :key="i" class="rounded-2xl border border-border bg-card p-2">
					<Skeleton class="aspect-4/3 w-full rounded-xl" />
					<Skeleton class="mt-2.5 h-4 w-4/5" />
					<Skeleton class="mt-1.5 h-4 w-1/2" />
					<Skeleton class="mt-4 h-5 w-1/3" />
				</div>
			</div>
			<div v-else data-testid="items-loading">
				<div
					v-for="i in 10"
					:key="i"
					class="flex h-12 items-center gap-3 border-b border-border/70 px-2"
				>
					<Skeleton v-if="!hideImages" class="size-9 rounded-md" />
					<Skeleton class="h-4 flex-1" />
					<Skeleton class="h-4 w-16" />
				</div>
			</div>
		</template>

		<ErrorState
			v-else-if="loadError && items.length === 0"
			:title="__('Products could not be loaded')"
			:description="__('Check the connection and try again.')"
			retryable
			:retrying="isLoading"
			data-testid="items-error"
			@retry="$emit('retry')"
		/>

		<EmptyState
			v-else-if="items.length === 0 && hasFilters"
			:icon="PackageSearch"
			:title="__('No products match')"
			:description="__('Try another search term or category.')"
			data-testid="items-empty"
		>
			<Button variant="outline" @click="$emit('clearFilters')">
				<X />
				{{ __("Clear filters") }}
			</Button>
		</EmptyState>

		<EmptyState
			v-else-if="items.length === 0"
			:icon="PackageSearch"
			:title="__('No products available')"
			:description="__('This POS Profile has no sellable items yet.')"
			data-testid="items-empty"
		/>

		<div v-else-if="viewMode === 'grid'" :class="gridClass" role="list" :aria-label="__('Products')">
			<ItemCard
				v-for="(item, index) in items"
				:key="item.item_code"
				role="listitem"
				:item="item"
				:currency-symbol="currencySymbol"
				:highlighted="index === highlightedIndex"
				:data-item-index="index"
				@click="$emit('selectItem', item)"
				@show-detail="$emit('showDetail', item)"
			/>
		</div>

		<div v-else class="overflow-hidden rounded-xl border border-border bg-card">
			<div
				class="sticky top-0 z-1 flex items-center gap-1 border-b border-border bg-surface-sunken/95 pe-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
				aria-hidden="true"
			>
				<div class="flex min-w-0 flex-1 items-center gap-3 py-1.5 ps-2 pe-1">
					<div class="grid min-w-0 flex-1 items-center gap-3" :class="itemRowGrid(!hideImages)">
						<span v-if="!hideImages" />
						<span>{{ __("Item") }}</span>
						<span class="hidden xl:block">{{ __("Group") }}</span>
						<span class="justify-self-end">{{ __("Stock") }}</span>
						<span class="text-end">{{ __("Price") }}</span>
					</div>
					<span class="w-7 shrink-0" />
				</div>
				<span class="w-8 shrink-0" />
			</div>
			<div role="list" :aria-label="__('Products')">
				<ItemListRow
					v-for="(item, index) in items"
					:key="item.item_code"
					role="listitem"
					:item="item"
					:currency-symbol="currencySymbol"
					:highlighted="index === highlightedIndex"
					:data-item-index="index"
					@click="$emit('selectItem', item)"
					@show-detail="$emit('showDetail', item)"
				/>
			</div>
		</div>

		<div v-if="isLoading && items.length > 0" class="flex justify-center py-6" role="status">
			<Loader2 class="size-6 animate-spin text-primary" aria-hidden="true" />
			<span class="sr-only">{{ __("Loading more products") }}</span>
		</div>

		<ErrorState
			v-else-if="loadError && items.length > 0"
			compact
			:title="__('More products could not be loaded')"
			retryable
			@retry="$emit('loadMore')"
		/>

		<div ref="sentinel" class="h-1"></div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import ItemCard from "./ItemCard.vue";
import ItemListRow from "./ItemListRow.vue";
import { Loader2, PackageSearch, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { itemRowGrid } from "@/composables/useItemTileState";
import type { POSItem } from "@/types/pos.types";
import __ from "@/lib/translate";

// Two columns on phones; from sm up as many 10.5rem cards as fit.
const gridClass = "grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] sm:gap-3";

const props = defineProps({
	items: { type: Array as () => POSItem[], default: () => [] },
	isLoading: { type: Boolean, default: false },
	loadError: { type: String as () => string | null, default: null },
	/** A search term or category is narrowing the list, so "nothing found" offers to clear it. */
	hasFilters: { type: Boolean, default: false },
	hideImages: { type: Boolean, default: false },
	currencySymbol: { type: String, default: "$" },
	viewMode: { type: String as () => "grid" | "list", default: "grid" },
	highlightedIndex: { type: Number, default: -1 },
});

const emit = defineEmits(["selectItem", "showDetail", "loadMore", "retry", "clearFilters"]);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
	observer = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting && !props.isLoading && !props.loadError && props.items.length > 0) {
				emit("loadMore");
			}
		},
		{ threshold: 0.1 },
	);
	if (sentinel.value) {
		observer.observe(sentinel.value);
	}
});

onUnmounted(() => {
	if (observer) observer.disconnect();
});
</script>
