<template>
	<div
		class="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors duration-150 dark:hover:bg-accent/50"
		:data-cart-index="index"
		tabindex="0"
		@keydown.delete="handleDeleteKey"
	>
		<div class="w-9 h-9 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
			<img
				v-if="item.image"
				:src="item.image"
				:alt="item.item_name"
				class="w-full h-full object-cover"
			/>
			<Package v-else class="w-4 h-4 text-muted-foreground/40" />
		</div>

		<div class="flex-1 min-w-0">
			<p class="text-[11px] font-medium text-foreground leading-tight truncate">
				{{ item.item_name }}
			</p>

			<div class="flex items-center gap-1 mt-0.5 flex-wrap">
				<template v-if="posStore.allowEditRate">
					<span class="text-[11px] text-muted-foreground">{{ currencySymbol }}</span>
					<input
						ref="rateInput"
						:value="item.rate"
						type="number"
						min="0"
						step="0.01"
						class="w-16 h-5 text-[11px] font-medium text-foreground bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary dark:border-muted-foreground/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						@change="onRateChange"
						@keydown.up.prevent="focusAdjacentItem(-1, 'rate')"
						@keydown.down.prevent="focusAdjacentItem(1, 'rate')"
						@keydown="blockInvalidNumericKeys"
					/>
				</template>
				<p v-else class="text-[11px] text-muted-foreground">
					{{ currencySymbol }}{{ formatPrice(item.rate) }}
				</p>

				<span class="text-[11px] text-muted-foreground">/</span>
				<button
					v-if="posStore.allowEditRate && hasMultipleUOMs"
					@click="showUOMSelector = !showUOMSelector"
					class="text-[11px] text-primary hover:underline focus:outline-none"
				>
					{{ item.uom || item.stock_uom }}
					<ChevronDown class="w-3 h-3 inline-block" />
				</button>
				<span v-else class="text-[11px] text-muted-foreground">
					{{ item.uom || item.stock_uom }}
				</span>
			</div>

			<div v-if="showUOMSelector && itemUOMs.length > 0" class="mt-1 p-1.5 bg-muted rounded-md">
				<div class="flex flex-wrap gap-1">
					<button
						v-for="u in itemUOMs"
						:key="u.uom"
						@click="selectUOM(u)"
						class="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
						:class="
							(item.uom || item.stock_uom) === u.uom
								? 'bg-primary text-primary-foreground'
								: 'bg-background border border-border hover:border-primary/40'
						"
					>
						{{ u.uom }}
						<span v-if="u.conversion_factor !== 1" class="text-[9px] opacity-70">
							(×{{ u.conversion_factor }})
						</span>
					</button>
				</div>
			</div>

			<div class="flex items-center gap-1 mt-1 flex-wrap">
				<Button variant="secondary" size="icon-sm" class="w-5 h-5" @click="decrementQty">
					<Minus class="w-2.5 h-2.5" />
				</Button>
				<input
					ref="qtyInput"
					:value="item.qty"
					type="number"
					min="0"
					class="w-9 h-5 text-center text-[10px] font-semibold text-foreground bg-muted/50 rounded border border-border focus:outline-none focus:ring-1 focus:ring-ring dark:bg-accent/50 dark:border-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-1"
					@change="onQtyChange"
					@keydown.up.prevent="focusAdjacentItem(-1, 'qty')"
					@keydown.down.prevent="focusAdjacentItem(1, 'qty')"
					@keydown="blockInvalidNumericKeys"
				/>
				<Button
					variant="secondary"
					size="icon-sm"
					class="w-5 h-5 bg-primary/10 text-primary hover:bg-primary/20"
					@click="incrementQty"
				>
					<Plus class="w-2.5 h-2.5" />
				</Button>

				<template v-if="posStore.allowEditItemDiscount">
					<button
						@click="showDiscountInput = !showDiscountInput"
						class="ms-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all"
						:class="
							hasItemDiscount
								? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
								: 'bg-muted text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
						"
					>
						<Percent class="w-3 h-3 inline-block" />
						{{ hasItemDiscount ? formatDiscount : "Disc" }}
					</button>
				</template>
			</div>

			<div
				v-if="showDiscountInput && posStore.allowEditItemDiscount"
				class="mt-1.5 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md border border-emerald-200 dark:border-emerald-800"
			>
				<div class="flex items-center gap-2">
					<button
						@click="discountType = 'percentage'"
						class="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
						:class="
							discountType === 'percentage'
								? 'bg-emerald-600 text-white'
								: 'bg-white dark:bg-muted border border-emerald-300 dark:border-emerald-700'
						"
					>
						%
					</button>
					<button
						@click="discountType = 'amount'"
						class="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
						:class="
							discountType === 'amount'
								? 'bg-emerald-600 text-white'
								: 'bg-white dark:bg-muted border border-emerald-300 dark:border-emerald-700'
						"
					>
						{{ currencySymbol }}
					</button>
					<input
						v-model.number="discountInput"
						type="number"
						min="0"
						:max="discountType === 'percentage' ? maxDiscount || 100 : undefined"
						step="0.5"
						placeholder="0"
						class="flex-1 h-6 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-muted rounded border border-emerald-300 dark:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
						@blur="applyDiscount"
						@keydown.enter="applyDiscount"
						@keydown="blockInvalidNumericKeys"
					/>
				</div>
			</div>
		</div>

		<div class="flex flex-col items-end gap-0.5 shrink-0">
			<span class="text-xs font-bold text-foreground tabular-nums">
				{{ currencySymbol }}{{ formatPrice(lineTotal) }}
			</span>
			<span v-if="hasItemDiscount" class="text-[9px] text-emerald-600 dark:text-emerald-400">
				-{{ currencySymbol }}{{ formatPrice(discountAmount) }}
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				class="md:opacity-0 md:group-hover:opacity-100 w-5 h-5 md:w-4 md:h-4 text-muted-foreground hover:text-destructive transition-all"
				@click="$emit('remove', index)"
			>
				<Trash2 class="w-3.5 h-3.5" />
			</Button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useItemStore } from "@/stores/itemStore";
import { Button } from "@/components/ui/button";
import { Package, Minus, Plus, Trash2, Percent, ChevronDown } from "lucide-vue-next";
import type { ItemUOM } from "@/types/pos.types";

const props = defineProps({
	item: { type: Object, required: true },
	index: { type: Number, required: true },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["update-qty", "update-rate", "update-discount", "update-uom", "remove"]);

const posStore = usePosStore();
const itemStore = useItemStore();

const qtyInput = ref<HTMLInputElement | null>(null);

const showUOMSelector = ref(false);
const showDiscountInput = ref(false);
const discountType = ref<"percentage" | "amount">("percentage");
const discountInput = ref(0);
const itemUOMs = ref<ItemUOM[]>([]);

const maxDiscount = computed(() => posStore.maxDiscountAllowed);

const hasMultipleUOMs = computed(() => itemUOMs.value.length > 1);

const hasItemDiscount = computed(
	() => (props.item.discount_percentage || 0) > 0 || (props.item.discount_amount || 0) > 0,
);

const formatDiscount = computed(() => {
	if (props.item.discount_percentage > 0) {
		return `${props.item.discount_percentage}%`;
	}
	if (props.item.discount_amount > 0) {
		return `${props.currencySymbol}${props.item.discount_amount}`;
	}
	return "";
});

const discountAmount = computed(() => {
	const total = props.item.qty * props.item.rate;
	if (props.item.discount_percentage > 0) {
		return (total * props.item.discount_percentage) / 100;
	}
	// For amount discount on return items (negative qty), negate the discount
	// so calculations work correctly
	const amt = props.item.discount_amount || 0;
	return props.item.qty < 0 ? -amt : amt;
});

const lineTotal = computed(() => {
	const total = props.item.qty * props.item.rate;
	return Math.round((total - discountAmount.value + Number.EPSILON) * 100) / 100;
});

onMounted(async () => {
	if (posStore.allowEditRate) {
		await loadItemUOMs();
	}
	if (props.item.discount_percentage > 0) {
		discountType.value = "percentage";
		discountInput.value = props.item.discount_percentage;
	} else if (props.item.discount_amount > 0) {
		discountType.value = "amount";
		discountInput.value = props.item.discount_amount;
	}
});

watch(
	() => props.item.item_code,
	async () => {
		if (posStore.allowEditRate) {
			await loadItemUOMs();
		}
	},
);

async function loadItemUOMs() {
	try {
		const detail = await itemStore.fetchItemDetail(
			props.item.item_code,
			posStore.profileName,
			posStore.warehouse,
		);
		if (detail?.uoms) {
			itemUOMs.value = detail.uoms;
		} else {
			itemUOMs.value = [{ uom: props.item.stock_uom || props.item.uom, conversion_factor: 1 }];
		}
	} catch {
		itemUOMs.value = [{ uom: props.item.stock_uom || props.item.uom, conversion_factor: 1 }];
	}
}

function selectUOM(u: ItemUOM) {
	const baseRate = props.item.rate / (props.item.conversion_factor || 1);
	const newRate = Math.round(baseRate * u.conversion_factor * 100) / 100;
	emit("update-uom", props.index, u.uom, newRate, u.conversion_factor);
	showUOMSelector.value = false;
}

function incrementQty() {
	emit("update-qty", props.index, props.item.qty + 1);
}

function decrementQty() {
	emit("update-qty", props.index, props.item.qty - 1);
}

function onQtyChange(e: Event) {
	const val = parseFloat((e.target as HTMLInputElement).value) || 0;
	emit("update-qty", props.index, val);
}

function onRateChange(e: Event) {
	const val = parseFloat((e.target as HTMLInputElement).value) || 0;
	emit("update-rate", props.index, Math.round(val * 100) / 100);
}

function applyDiscount() {
	let val = discountInput.value || 0;
	if (discountType.value === "percentage") {
		const max = maxDiscount.value || 100;
		val = Math.min(val, max);
	}
	emit("update-discount", props.index, discountType.value, val);
}

function focusAdjacentItem(direction: number, field: "qty" | "rate") {
	const targetIndex = props.index + direction;
	const container = qtyInput.value?.closest("[data-cart-index]")?.parentElement;
	if (!container) return;

	const targetEl = container.querySelector(`[data-cart-index="${targetIndex}"]`);
	if (!targetEl) return;

	if (field === "qty") {
		const inputs = targetEl.querySelectorAll('input[type="number"]');
		const qtyEl = inputs.length > 1 ? inputs[1] : inputs[0];
		if (qtyEl) {
			(qtyEl as HTMLInputElement).focus();
			(qtyEl as HTMLInputElement).select();
		}
	} else {
		const rateEl = targetEl.querySelector('input[type="number"]');
		if (rateEl) {
			(rateEl as HTMLInputElement).focus();
			(rateEl as HTMLInputElement).select();
		}
	}
}

function formatPrice(price: number | string) {
	return (Math.round((parseFloat(String(price) || "0") + Number.EPSILON) * 100) / 100).toFixed(2);
}

function blockInvalidNumericKeys(event: KeyboardEvent) {
	if (["e", "E", "+", "-"].includes(event.key)) {
		event.preventDefault();
	}
}

function handleDeleteKey(event: KeyboardEvent) {
	const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
	if (tag === "input" || tag === "textarea") return;
	event.preventDefault();
	event.stopPropagation();
	emit("remove", props.index);
}
</script>
