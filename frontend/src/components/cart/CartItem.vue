<template>
	<div
		class="scroll-mt-1 rounded-2xl border bg-surface-raised p-3 shadow-raised transition-[border-color,box-shadow] duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
		:class="isSelected ? 'border-primary ring-1 ring-primary/40' : 'border-border'"
		:data-cart-index="index"
		tabindex="0"
		@focusin="selectRow"
		@click="selectRow"
		@keydown.delete="handleDeleteKey"
		@keydown="handleRowKeydown"
	>
		<div class="flex gap-3">
			<div
				class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card"
			>
				<img
					v-if="item.image"
					:src="item.image"
					:alt="item.item_name"
					class="h-full w-full object-contain p-1"
				/>
				<Package v-else class="size-5 text-muted-foreground/60" />
			</div>

			<div class="min-w-0 flex-1">
				<div class="flex items-start gap-2">
					<div class="min-w-0 flex-1">
						<p class="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-foreground">
							{{ item.item_name }}
						</p>
						<p class="truncate font-mono text-xs text-muted-foreground">{{ item.item_code }}</p>
					</div>
					<Popover v-model:open="menuOpen">
						<PopoverTrigger as-child>
							<Button
								variant="ghost"
								size="icon"
								class="-me-1 size-9 shrink-0"
								:aria-label="__('Line options')"
							>
								<MoreVertical class="size-5!" />
							</Button>
						</PopoverTrigger>
						<PopoverContentStyled class="w-56 p-1.5" align="end" role="menu">
							<PopoverMenuItem
								v-if="hasMultipleUOMs"
								shortcut="U"
								@click="
									menuOpen = false;
									showUOMSelector = !showUOMSelector;
								"
							>
								<template #icon><Ruler /></template>
								{{ __("Change unit") }}
							</PopoverMenuItem>
							<PopoverMenuItem
								v-if="hasPermission('show_edit_discount_field') && !item.pos_is_free_item"
								@click="
									menuOpen = false;
									showDiscountInput = !showDiscountInput;
								"
							>
								<template #icon><Percent /></template>
								{{ hasItemDiscount ? __("Edit discount") : __("Add discount") }}
							</PopoverMenuItem>
							<PopoverMenuItem
								destructive
								shortcut="Del"
								@click="
									menuOpen = false;
									$emit('remove', index);
								"
							>
								<template #icon><Trash2 /></template>
								{{ __("Remove") }}
							</PopoverMenuItem>
						</PopoverContentStyled>
					</Popover>
				</div>

				<div class="mt-2 flex items-center gap-2">
					<div class="flex min-w-0 flex-1 items-baseline gap-1 whitespace-nowrap">
						<template v-if="hasPermission('allow_change_price') && !item.pos_is_free_item">
							<span class="text-sm font-bold text-foreground">{{ currencySymbol }}</span>
							<input
								ref="rateInput"
								:value="item.rate"
								type="number"
								min="0"
								:step="rateStep"
								:aria-label="__('Rate')"
								:style="{ width: `${String(item.rate ?? '').length + 2}ch` }"
								class="min-w-[4ch] rounded-md border border-transparent bg-transparent px-1 text-base font-bold text-foreground tabular-nums hover:border-border focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
								@change="onRateChange"
								@keydown.up.prevent="focusAdjacentItem(-1, 'rate')"
								@keydown.down.prevent="focusAdjacentItem(1, 'rate')"
								@keydown="blockInvalidNumericKeys"
							/>
						</template>
						<span v-else class="text-base font-bold text-foreground tabular-nums">
							{{ moneyRate(item.rate) }}
						</span>
						<span class="text-xs text-muted-foreground">/</span>
						<button
							v-if="hasMultipleUOMs"
							ref="uomToggleRef"
							@click="showUOMSelector = !showUOMSelector"
							@keydown.left.prevent="cycleUOM(-1)"
							@keydown.right.prevent="cycleUOM(1)"
							@keydown.space.prevent="showUOMSelector = !showUOMSelector"
							@keydown.enter.prevent="showUOMSelector = !showUOMSelector"
							@keydown.escape="showUOMSelector = false"
							class="inline-flex items-center gap-0.5 truncate rounded text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
							:title="__('Left/Right to cycle · Enter to open · U to toggle')"
						>
							{{ item.uom || item.stock_uom }}
							<ChevronDown class="size-3.5" />
						</button>
						<span v-else class="truncate text-xs text-muted-foreground">{{
							item.uom || item.stock_uom
						}}</span>
					</div>

					<div
						v-if="item.pos_is_free_item"
						class="shrink-0 text-sm font-semibold text-muted-foreground"
					>
						{{ __("Qty") }}: {{ qty(item.qty) }}
					</div>
					<div v-else class="flex shrink-0 items-center gap-1.5">
						<Button
							variant="outline"
							size="icon"
							class="size-9 rounded-xl"
							:aria-label="__('Decrease quantity')"
							@click="decrementQty"
						>
							<Minus class="size-4!" />
						</Button>
						<input
							ref="qtyInput"
							:value="item.qty"
							type="number"
							min="0"
							data-testid="cart-qty"
							:aria-label="__('Quantity')"
							class="h-9 w-12 rounded-xl border border-border bg-card text-center text-base font-semibold text-foreground shadow-inset tabular-nums focus:outline-none focus:ring-4 focus:ring-primary/12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
							@change="onQtyChange"
							@keydown.up.prevent="focusAdjacentItem(-1, 'qty')"
							@keydown.down.prevent="focusAdjacentItem(1, 'qty')"
							@keydown="blockInvalidNumericKeys"
						/>
						<Button
							variant="outline"
							size="icon"
							class="size-9 rounded-xl text-primary"
							:aria-label="__('Increase quantity')"
							@click="incrementQty"
						>
							<Plus class="size-4!" />
						</Button>
					</div>

					<div class="flex min-w-20 shrink-0 flex-col items-end">
						<span
							class="text-base font-bold text-foreground tabular-nums"
							data-testid="cart-amount"
						>
							{{ money(lineTotal) }}
						</span>
						<span
							v-if="hasItemDiscount"
							class="text-xs font-medium text-success-soft-foreground tabular-nums"
						>
							-{{ money(discountAmount) }}
						</span>
					</div>
				</div>
			</div>
		</div>

		<div v-if="statusBadges.length" class="mt-2 flex flex-wrap gap-1.5 ps-15">
			<Badge
				v-for="badge in statusBadges"
				:key="badge.label"
				:variant="badge.variant"
				size="sm"
				:title="badge.title"
				:role="badge.status ? 'status' : undefined"
			>
				{{ badge.label }}
			</Badge>
		</div>

		<div
			v-if="needsSerial"
			class="mt-3 flex items-center gap-3 rounded-xl border border-info/25 bg-info-soft px-3 py-2.5 text-info-soft-foreground"
			role="status"
		>
			<Box class="size-5 shrink-0" />
			<div class="min-w-0">
				<p class="text-sm font-semibold">{{ __("Serial required") }}</p>
				<p class="text-xs">{{ __("This product requires a serial number.") }}</p>
			</div>
		</div>

		<div
			v-if="showUOMSelector && itemUOMs.length > 0"
			ref="uomContainerRef"
			class="mt-3 rounded-xl border border-border bg-surface-sunken p-2"
			@keydown="handleUOMContainerKeydown"
		>
			<p class="mb-1.5 text-xs text-muted-foreground">
				← → {{ __("cycle") }} &bull; 1–{{ itemUOMs.length }} {{ __("select") }} &bull; Esc
				{{ __("close") }}
			</p>
			<div class="flex flex-wrap gap-1.5">
				<button
					v-for="(u, i) in itemUOMs"
					:key="u.uom"
					:data-uom="u.uom"
					@click="selectUOM(u)"
					@keydown.left.prevent="focusUOMButton($event, -1)"
					@keydown.right.prevent="focusUOMButton($event, 1)"
					@keydown.enter.prevent="selectUOM(u)"
					class="h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
					:class="
						(item.uom || item.stock_uom) === u.uom
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-card hover:bg-surface-hover'
					"
				>
					<span class="me-1 text-xs opacity-60">{{ i + 1 }}.</span>
					{{ u.uom }}
					<span v-if="u.conversion_factor !== 1" class="text-xs opacity-70"
						>(×{{ u.conversion_factor }})</span
					>
				</button>
			</div>
		</div>

		<div
			v-if="showDiscountInput && hasPermission('show_edit_discount_field')"
			class="mt-3 flex items-center gap-2 rounded-xl border border-success/25 bg-success-soft p-2"
		>
			<Button
				size="sm"
				:variant="discountType === 'percentage' ? 'success' : 'outline'"
				:aria-pressed="discountType === 'percentage'"
				@click="discountType = 'percentage'"
			>
				%
			</Button>
			<Button
				size="sm"
				:variant="discountType === 'amount' ? 'success' : 'outline'"
				:aria-pressed="discountType === 'amount'"
				@click="discountType = 'amount'"
			>
				{{ currencySymbol }}
			</Button>
			<input
				v-model.number="discountInput"
				type="number"
				min="0"
				:max="discountType === 'percentage' ? maxDiscount || 100 : undefined"
				step="0.5"
				placeholder="0"
				:aria-label="__('Discount')"
				class="h-control-compact min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-center text-sm font-semibold text-foreground shadow-inset focus:outline-none focus:ring-4 focus:ring-primary/12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				@blur="applyDiscount"
				@keydown.enter="applyDiscount"
				@keydown="blockInvalidNumericKeys"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from "vue";
import { usePosStore } from "@/stores/posStore";
import { hasPermission } from "@/services/userRights";
import { useCartStore } from "@/stores/cartStore";
import { useItemStore } from "@/stores/itemStore";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariants } from "@/components/ui/badge";
import { Popover, PopoverContentStyled, PopoverMenuItem, PopoverTrigger } from "@/components/ui/popover";
import {
	Package,
	Minus,
	Plus,
	Trash2,
	Percent,
	ChevronDown,
	MoreVertical,
	Ruler,
	Box,
} from "lucide-vue-next";
import type { ItemUOM } from "@/types/pos.types";
import __ from "@/lib/translate";
import { useMoney } from "@/composables/useMoney";

const props = defineProps({
	item: { type: Object, required: true },
	index: { type: Number, required: true },
	currencySymbol: { type: String, default: "$" },
});

const emit = defineEmits(["update-qty", "update-rate", "update-discount", "update-uom", "remove"]);

const posStore = usePosStore();
const cartStore = useCartStore();
const { money, moneyRate, percent, qty } = useMoney();
const itemStore = useItemStore();

const qtyInput = ref<HTMLInputElement | null>(null);
const uomToggleRef = ref<HTMLButtonElement | null>(null);
const uomContainerRef = ref<HTMLDivElement | null>(null);

const showUOMSelector = ref(false);
const showDiscountInput = ref(false);
const menuOpen = ref(false);

const needsSerial = computed(() => !!props.item.has_serial_no && !props.item.serial_no);

const statusBadges = computed(() => {
	const badges: { label: string; variant: BadgeVariants["variant"]; title?: string; status?: boolean }[] =
		[];
	if (props.item.pos_is_free_item) badges.push({ label: __("Free"), variant: "success" });
	if (props.item.pos_price_unavailable && !props.item.pos_rate_overridden) {
		badges.push({
			label:
				props.item.pos_price_state === "needs_connection"
					? __("Needs connection for price")
					: __("Price unavailable"),
			variant: "warning",
			status: true,
		});
	}
	if (props.item.pos_repriced_from !== undefined) {
		badges.push({
			label: __("Price changed from {0}", [props.item.pos_repriced_from]),
			variant: "info",
			status: true,
		});
	}
	if (isAutoDiscount.value)
		badges.push({ label: __("Auto"), variant: "info", title: autoDiscountTitle.value });
	if (hasItemDiscount.value)
		badges.push({ label: __("Discount {0}", [formatDiscount.value]), variant: "success" });
	return badges;
});
const discountType = ref<"percentage" | "amount">("percentage");
const discountInput = ref(0);
const itemUOMs = ref<ItemUOM[]>([]);

const maxDiscount = computed(() => posStore.maxDiscountAllowed);

const isSelected = computed(() => cartStore.selectedCartIndex === props.index);

const hasMultipleUOMs = computed(() => itemUOMs.value.length > 1);

const hasItemDiscount = computed(
	() => (props.item.discount_percentage || 0) > 0 || (props.item.discount_amount || 0) > 0,
);

const isAutoDiscount = computed(() => (props.item.pos_pricing_rules?.length || 0) > 0);

const autoDiscountTitle = computed(() =>
	isAutoDiscount.value ? __("Applied by pricing rule: {0}", [props.item.pos_pricing_rules.join(", ")]) : "",
);

const formatDiscount = computed(() => {
	if (props.item.discount_percentage > 0) {
		return percent(props.item.discount_percentage);
	}
	if (props.item.discount_amount > 0) {
		return money(props.item.discount_amount);
	}
	return "";
});

const discountAmount = computed(() => {
	const total = props.item.qty * props.item.rate;
	if (props.item.discount_percentage > 0) {
		return (total * props.item.discount_percentage) / 100;
	}
	const amt = props.item.discount_amount || 0;
	return props.item.qty < 0 ? -amt : amt;
});

const lineTotal = computed(() => {
	const total = props.item.qty * props.item.rate;
	return Math.round((total - discountAmount.value + Number.EPSILON) * 100) / 100;
});

onMounted(async () => {
	await loadItemUOMs();
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
		await loadItemUOMs();
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

// Focus the currently-selected UOM button when popup opens
watch(showUOMSelector, (open) => {
	if (open) {
		nextTick(() => {
			const current = props.item.uom || props.item.stock_uom;
			const btn = uomContainerRef.value?.querySelector(
				`[data-uom="${current}"]`,
			) as HTMLButtonElement | null;
			btn?.focus();
		});
	} else {
		uomToggleRef.value?.focus();
	}
});

function cycleUOM(direction: number) {
	if (itemUOMs.value.length <= 1) return;
	const current = props.item.uom || props.item.stock_uom;
	const idx = itemUOMs.value.findIndex((u) => u.uom === current);
	const next = (idx + direction + itemUOMs.value.length) % itemUOMs.value.length;
	selectUOM(itemUOMs.value[next]);
}

function handleUOMContainerKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		showUOMSelector.value = false;
		return;
	}
	const num = parseInt(event.key);
	if (!isNaN(num) && num >= 1 && num <= itemUOMs.value.length) {
		event.preventDefault();
		selectUOM(itemUOMs.value[num - 1]);
	}
}

function focusUOMButton(event: KeyboardEvent, direction: number) {
	const container = uomContainerRef.value;
	if (!container) return;
	const buttons = Array.from(container.querySelectorAll("button[data-uom]")) as HTMLButtonElement[];
	const idx = buttons.indexOf(event.target as HTMLButtonElement);
	if (idx < 0) return;
	const next = (idx + direction + buttons.length) % buttons.length;
	buttons[next]?.focus();
}

function selectUOM(u: ItemUOM) {
	const baseRate = props.item.rate / (props.item.conversion_factor || 1);
	const newRate = roundRate(baseRate * u.conversion_factor);
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
	emit("update-rate", props.index, roundRate(val));
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

const ratePrecision = computed(() => cartStore.itemRatePrecision);

const rateStep = computed(() => {
	const p = ratePrecision.value;
	return p > 0 ? (1 / 10 ** p).toFixed(p) : "1";
});

function roundRate(value: number) {
	const p = ratePrecision.value;
	return Math.round((value + Number.EPSILON) * 10 ** p) / 10 ** p;
}

function blockInvalidNumericKeys(event: KeyboardEvent) {
	if (["e", "E", "+", "-"].includes(event.key)) {
		event.preventDefault();
	}
}

function selectRow() {
	cartStore.setSelectedCartIndex(props.index);
}

function handleDeleteKey(event: KeyboardEvent) {
	if (event.target !== event.currentTarget) return;
	event.preventDefault();
	event.stopPropagation();
	selectRow();
	emit("remove", props.index);
}

function handleRowKeydown(event: KeyboardEvent) {
	const targetIsRow = event.target === event.currentTarget;
	const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
	const isInputLike = tag === "input" || tag === "textarea";

	if (targetIsRow && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
		event.preventDefault();
		focusAdjacentRow(event.key === "ArrowDown" ? 1 : -1);
		return;
	}

	if (targetIsRow && event.key === "Enter") {
		event.preventDefault();
		qtyInput.value?.focus();
		qtyInput.value?.select();
		return;
	}

	if (isInputLike) return;

	if ((event.key === "u" || event.key === "U") && hasMultipleUOMs.value) {
		event.preventDefault();
		showUOMSelector.value = !showUOMSelector.value;
		return;
	}
	if (!showUOMSelector.value && hasMultipleUOMs.value) {
		const num = parseInt(event.key);
		if (!isNaN(num) && num >= 1 && num <= itemUOMs.value.length) {
			event.preventDefault();
			selectUOM(itemUOMs.value[num - 1]);
		}
	}
}

function focusAdjacentRow(direction: number) {
	const targetIndex = props.index + direction;
	const currentEl = document.querySelector(`[data-cart-index="${props.index}"]`) as HTMLElement | null;
	const container = currentEl?.parentElement;
	if (!container) return;
	const targetEl = container.querySelector(`[data-cart-index="${targetIndex}"]`) as HTMLElement | null;
	if (targetEl) {
		targetEl.focus();
		targetEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}
}
</script>
