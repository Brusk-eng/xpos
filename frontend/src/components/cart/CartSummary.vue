<template>
	<div class="shrink-0 space-y-2.5 border-t border-border px-4 pt-3 pb-3">
		<div
			v-if="cartStore.pricingSource === 'offline'"
			class="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"
		>
			<WifiOff class="w-3 h-3 shrink-0" />
			{{ __("Prices calculated offline, will be confirmed when the invoice syncs") }}
		</div>

		<div
			v-if="cartStore.repriceReview"
			role="alert"
			class="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-[11px] text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 space-y-1.5"
		>
			<p class="font-semibold">{{ __("Prices changed - nothing was charged or saved") }}</p>
			<p>
				{{
					__(
						"The server priced this sale at {0}. Check the marked lines, then take payment again.",
						[money(cartStore.repriceReview.rounded_total || cartStore.repriceReview.grand_total)],
					)
				}}
			</p>
			<Button
				size="sm"
				variant="outline"
				class="h-7 text-[11px]"
				@click="cartStore.acknowledgeRepricing()"
			>
				{{ __("I have reviewed the new prices") }}
			</Button>
		</div>

		<div class="space-y-1 px-1 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-foreground">
					{{ __("Subtotal") }}
					<span class="text-muted-foreground">({{ itemsLabel }})</span>
				</span>
				<span class="font-semibold text-foreground tabular-nums">
					{{ money(cartStore.subtotal) }}
				</span>
			</div>

			<div v-if="!hasAnyDiscount" class="flex items-center justify-between">
				<span class="text-muted-foreground">{{ __("Discount") }}</span>
				<span class="font-medium text-foreground tabular-nums">{{ money(0) }}</span>
			</div>

			<div v-if="cartStore.calculatedTaxes.length === 0" class="flex items-center justify-between">
				<span class="text-muted-foreground">{{ __("Tax") }}</span>
				<span class="font-medium text-foreground tabular-nums">{{ money(0) }}</span>
			</div>

			<div v-if="itemDiscountTotal > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground flex items-center gap-1">
					<Percent class="w-3 h-3" /> {{ __("Item Discounts") }}
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ money(itemDiscountTotal) }}
				</span>
			</div>

			<template v-if="cartStore.calculatedTaxes.length > 0">
				<div
					v-for="(tax, idx) in cartStore.calculatedTaxes"
					:key="idx"
					class="flex items-center justify-between text-sm"
				>
					<span class="text-muted-foreground flex items-center gap-1">
						{{ tax.description }}
						<span v-if="tax.rate" class="text-xs text-muted-foreground/70"
							>({{ percent(tax.rate) }})</span
						>
						<span v-if="tax.included_in_print_rate" class="text-[10px] text-blue-500">{{
							__("incl.")
						}}</span>
					</span>
					<span
						class="font-medium"
						:class="
							tax.included_in_print_rate
								? 'text-blue-600 dark:text-blue-400'
								: 'text-foreground'
						"
					>
						{{ formatTaxAmount(tax.amount, tax.included_in_print_rate, money) }}
					</span>
				</div>
			</template>

			<div
				v-if="cartStore.offerItemDiscountTotal > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
					<Ticket class="w-3 h-3" /> {{ __("Offer Discount") }}
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ money(cartStore.offerItemDiscountTotal) }}
				</span>
			</div>

			<div
				v-if="cartStore.offerGrandTotalDiscountPct > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
					<Ticket class="w-3 h-3" /> {{ __("Offer") }}
					<span class="text-xs">({{ percent(cartStore.offerGrandTotalDiscountPct) }})</span>
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ money(grandTotalOfferDiscount) }}
				</span>
			</div>

			<div
				v-if="cartStore.discountPercentage > 0 || cartStore.discountAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-muted-foreground flex items-center gap-1">
					<Tag class="w-3 h-3" />
					{{ __("Additional Discount") }}
					<span
						v-if="cartStore.discountPercentage > 0"
						class="text-xs text-emerald-600 dark:text-emerald-400"
					>
						({{ percent(cartStore.discountPercentage) }})
					</span>
				</span>
				<span class="font-medium text-emerald-600 dark:text-emerald-400">
					-{{ money(discountValue) }}
				</span>
			</div>

			<div
				v-if="cartStore.redeemLoyaltyPoints && cartStore.loyaltyAmount > 0"
				class="flex items-center justify-between text-sm"
			>
				<span class="text-violet-600 dark:text-violet-400 flex items-center gap-1">
					<Gift class="w-3.5 h-3.5" /> {{ __("Loyalty") }}
				</span>
				<span class="font-medium text-violet-600 dark:text-violet-400">
					-{{ money(cartStore.loyaltyAmount) }}
				</span>
			</div>

			<div v-if="cartStore.writeOffAmount > 0" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{{ __("Write Off") }}</span>
				<span class="font-medium text-amber-600 dark:text-amber-400">
					-{{ money(cartStore.writeOffAmount) }}
				</span>
			</div>

			<div v-if="cartStore.selectedDeliveryCharge" class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground flex items-center gap-1">
					<Truck class="w-3 h-3" /> {{ cartStore.selectedDeliveryCharge.label }}
				</span>
				<span class="font-medium text-foreground">
					+{{ money(cartStore.selectedDeliveryCharge.rate) }}
				</span>
			</div>

			<Separator class="my-2!" />

			<div class="flex items-center justify-between">
				<span class="text-lg font-bold text-foreground">{{ __("Total") }}</span>
				<span
					class="text-2xl font-extrabold tracking-tight tabular-nums"
					:class="cartStore.isReturnMode ? 'text-warning' : 'text-primary dark:text-focus'"
					data-testid="cart-grand-total"
				>
					{{ cartStore.isReturnMode ? "-" : "" }}{{ money(Math.abs(cartStore.grandTotal)) }}
				</span>
			</div>
		</div>

		<div class="grid auto-cols-fr grid-flow-col gap-2.5">
			<TooltipWrapper :content="__('Hold sale')" shortcut="Ctrl+H">
				<Button
					variant="outline"
					class="h-11 gap-2 rounded-xl px-2 font-semibold"
					:disabled="cartStore.isEmpty"
					data-testid="hold-order"
					@click="holdOrder"
				>
					<Pause class="size-5!" />
					{{ __("Hold") }}
				</Button>
			</TooltipWrapper>

			<Popover v-if="hasPermission('apply_additional_discount')" v-model:open="showDiscount">
				<PopoverTrigger as-child>
					<Button
						variant="outline"
						class="h-11 gap-2 rounded-xl px-2 font-semibold"
						:aria-pressed="showDiscount || hasDiscount"
						:disabled="cartStore.isEmpty"
					>
						<Percent class="size-5!" />
						{{ __("Discount") }}
					</Button>
				</PopoverTrigger>
				<PopoverContentStyled class="w-80 space-y-3" side="top" align="start">
					<p class="text-sm font-semibold">{{ __("Additional Discount") }}</p>
					<div class="flex items-center gap-2">
						<div
							class="inline-flex shrink-0 gap-1 rounded-xl border border-border bg-surface-sunken p-1"
						>
							<Button
								:variant="discountType === 'percentage' ? 'default' : 'ghost'"
								size="sm"
								class="px-3"
								:aria-pressed="discountType === 'percentage'"
								@click="discountType = 'percentage'"
							>
								%
							</Button>
							<Button
								:variant="discountType === 'amount' ? 'default' : 'ghost'"
								size="sm"
								class="px-3"
								:aria-pressed="discountType === 'amount'"
								@click="discountType = 'amount'"
							>
								{{ posStore.currencySymbol }}
							</Button>
						</div>
						<NumberInput
							v-model="discountInput"
							:min="0"
							:max="discountType === 'percentage' ? 100 : undefined"
							:precision="moneyPrecision"
							class="flex-1"
							:placeholder="
								discountType === 'percentage' ? __('Discount %') : __('Discount amount')
							"
							@change="applyDiscount"
							@keydown.enter="showDiscount = false"
						/>
					</div>
				</PopoverContentStyled>
			</Popover>

			<Popover v-if="posStore.allowCouponEntry" v-model:open="showCoupon">
				<PopoverTrigger as-child>
					<Button
						variant="outline"
						class="h-11 gap-2 rounded-xl px-2 font-semibold"
						:aria-pressed="showCoupon || !!cartStore.appliedCoupon"
						:disabled="cartStore.isEmpty"
					>
						<Ticket class="size-5!" />
						{{ __("Coupon") }}
					</Button>
				</PopoverTrigger>
				<PopoverContentStyled class="w-80 space-y-3" side="top" align="center">
					<p class="text-sm font-semibold">{{ __("Coupon") }}</p>
					<div class="flex items-center gap-2">
						<Input
							v-model="couponInput"
							type="text"
							:placeholder="__('Enter coupon code...')"
							class="flex-1"
							@keydown.enter="applyCouponCode"
						/>
						<Button :loading="isApplyingCoupon" :disabled="!couponInput" @click="applyCouponCode">
							{{ __("Apply") }}
						</Button>
					</div>
					<p v-if="couponError" class="text-sm text-destructive-soft-foreground">
						{{ couponError }}
					</p>
				</PopoverContentStyled>
			</Popover>

			<Popover v-model:open="moreOpen">
				<PopoverTrigger as-child>
					<Button
						variant="outline"
						class="h-11 gap-2 rounded-xl px-2 font-semibold"
						data-testid="cart-more"
						:aria-label="__('More actions')"
					>
						<MoreHorizontal class="size-5!" />
						{{ __("More") }}
					</Button>
				</PopoverTrigger>
				<PopoverContentStyled
					:class="moreView === 'menu' ? 'w-64 p-1.5' : 'w-80 space-y-3'"
					align="end"
					side="top"
					:role="moreView === 'menu' ? 'menu' : undefined"
				>
					<template v-if="moreView === 'menu'">
						<PopoverMenuItem @click="runMore(() => cartStore.openDraftDialog())">
							<template #icon><FileText /></template>
							{{ __("Restore draft") }}
						</PopoverMenuItem>
						<PopoverMenuItem
							v-if="canSellGiftCards"
							data-testid="sell-gift-card"
							:disabled="
								!offlineStore.isOnline || (!cartStore.isEmpty && !cartStore.isGiftCardSale)
							"
							@click="openMoreView('gift')"
						>
							<template #icon><Gift /></template>
							{{ __("Sell gift card") }}
						</PopoverMenuItem>
						<PopoverMenuItem
							v-if="!cartStore.isReturnMode && posStore.useDeliveryCharges"
							:disabled="cartStore.isEmpty"
							@click="openMoreView('delivery')"
						>
							<template #icon><Truck /></template>
							{{
								cartStore.selectedDeliveryCharge
									? __("Change delivery charge")
									: __("Delivery charge")
							}}
						</PopoverMenuItem>
						<PopoverMenuItem :disabled="!hasAnyDiscount" @click="runMore(clearAllDiscounts)">
							<template #icon><X /></template>
							{{ __("Clear all discounts") }}
						</PopoverMenuItem>
						<div class="my-1.5 h-px bg-border" role="separator" />
						<PopoverMenuItem
							destructive
							data-testid="clear-cart"
							:disabled="cartStore.isEmpty"
							@click="runMore(handleClearCart)"
						>
							<template #icon><Trash2 /></template>
							{{ __("Clear cart") }}
						</PopoverMenuItem>
					</template>

					<template v-else-if="moreView === 'gift'">
						<p class="text-sm font-semibold">{{ __("Sell gift card") }}</p>
						<div class="flex items-center gap-2">
							<NumberInput
								v-model="giftCardValue"
								:min="0"
								:precision="moneyPrecision"
								class="flex-1"
								data-testid="gift-card-value"
								:placeholder="__('Gift card value')"
								@keydown.enter="addGiftCard"
							/>
							<Button :disabled="!(giftCardValue > 0)" @click="addGiftCard">
								{{ __("Add gift card") }}
							</Button>
						</div>
						<p class="text-sm text-muted-foreground">
							{{
								__(
									"A new code is printed when the sale is paid. Gift cards are sold on their own sale.",
								)
							}}
						</p>
					</template>

					<template v-else>
						<div class="flex items-center justify-between">
							<p class="text-sm font-semibold">{{ __("Delivery Charges") }}</p>
							<Button
								v-if="cartStore.selectedDeliveryCharge"
								variant="ghost"
								size="sm"
								class="text-destructive-soft-foreground"
								@click="cartStore.setDeliveryCharge(null)"
							>
								{{ __("Remove") }}
							</Button>
						</div>
						<LoadingState v-if="isLoadingDelivery" compact />
						<p v-else-if="!availableDeliveryCharges.length" class="text-sm text-muted-foreground">
							{{ __("No delivery charges available for this profile") }}
						</p>
						<div v-else class="flex flex-wrap gap-2">
							<button
								v-for="charge in availableDeliveryCharges"
								:key="charge.name"
								type="button"
								class="h-9 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
								:class="
									cartStore.selectedDeliveryCharge?.name === charge.name
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-card hover:bg-surface-hover'
								"
								:aria-pressed="cartStore.selectedDeliveryCharge?.name === charge.name"
								@click="selectDeliveryCharge(charge)"
							>
								{{ charge.label }} &mdash; {{ money(charge.rate) }}
							</button>
						</div>
					</template>
				</PopoverContentStyled>
			</Popover>
		</div>

		<Button
			class="relative h-14 w-full gap-3 rounded-2xl text-lg font-bold"
			:class="
				cartStore.isReturnMode &&
				'border-warning bg-warning text-warning-foreground shadow-raised hover:bg-warning/90'
			"
			:disabled="cartStore.isEmpty || !cartStore.customer"
			data-testid="pay-button"
			@click="handleCheckout()"
		>
			<CreditCard class="size-6!" />
			{{ payButtonLabel }}
			<kbd
				class="absolute end-4 hidden h-8 min-w-10 items-center justify-center rounded-lg border border-white/30 bg-white/15 px-2 font-mono text-sm font-semibold sm:inline-flex"
				aria-hidden="true"
				>F4</kbd
			>
		</Button>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { hasPermission } from "@/services/userRights";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { useOfferStore } from "@/stores/offerStore";
import { call, showSuccess, showError, showInfo } from "@/services/api";
import { __ } from "@/lib/translate";
import { isElectron } from "@/services/electronBridge";
import { isTabConflictError } from "@/utils";
import { useOfflineStore } from "@/stores/offlineStore";
import { usePrintInvoice } from "@/composables/usePrintInvoice";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContentStyled, PopoverMenuItem, PopoverTrigger } from "@/components/ui/popover";
import { LoadingState } from "@/components/ui/state";
import {
	Tag,
	Ticket,
	Pause,
	Trash2,
	CreditCard,
	Gift,
	Loader2,
	Percent,
	FileText,
	Truck,
	WifiOff,
	X,
	MoreHorizontal,
} from "lucide-vue-next";
import type { DeliveryCharge } from "@/types/pos.types";
import { useMoney } from "@/composables/useMoney";
import { formatTaxAmount } from "@/utils/numberFormat";

const posStore = usePosStore();
const { money, moneyPrecision, percent } = useMoney();
const cartStore = useCartStore();
const authStore = useAuthStore();
const offerStore = useOfferStore();
const offlineStore = useOfflineStore();
const { printInvoice, printInvoiceLocal } = usePrintInvoice();

const showDiscount = ref(false);
const showCoupon = ref(false);
const moreOpen = ref(false);
const moreView = ref<"menu" | "gift" | "delivery">("menu");

function runMore(action: () => unknown) {
	moreOpen.value = false;
	action();
}

function openMoreView(view: "gift" | "delivery") {
	moreView.value = view;
	if (view === "gift") showGiftCard.value = true;
	else void toggleDelivery();
}

watch(moreOpen, (open) => {
	if (open) return;
	moreView.value = "menu";
	showGiftCard.value = false;
	showDelivery.value = false;
});

const itemsLabel = computed(() =>
	cartStore.items.length === 1 ? __("1 item") : __("{0} items", [cartStore.items.length]),
);
const showGiftCard = ref(false);
const giftCardValue = ref(0);
const canSellGiftCards = computed(
	() => !!posStore.giftCards && !cartStore.isReturnMode && hasPermission("sell_gift_card"),
);

function addGiftCard() {
	const result = cartStore.addGiftCardLine(giftCardValue.value);
	if (!result.success) {
		showError(result.message || __("Could not add the gift card."));
		return;
	}
	giftCardValue.value = 0;
	showGiftCard.value = false;
	moreOpen.value = false;
}
const showDelivery = ref(false);
const isLoadingDelivery = ref(false);
const availableDeliveryCharges = ref<DeliveryCharge[]>([]);
const discountType = ref("percentage");
const discountInput = ref(0);
const couponInput = ref("");
const couponError = ref("");
const isApplyingCoupon = ref(false);

const hasDiscount = computed(() => cartStore.discountPercentage > 0 || cartStore.discountAmount > 0);

const grandTotalOfferDiscount = computed(() => {
	if (cartStore.offerGrandTotalDiscountPct <= 0) return 0;
	const baseTotal =
		cartStore.subtotal +
		cartStore.calculatedTaxes.filter((t) => !t.included_in_print_rate).reduce((s, t) => s + t.amount, 0) -
		cartStore.offerItemDiscountTotal;
	return (baseTotal * cartStore.offerGrandTotalDiscountPct) / 100;
});

const hasAnyDiscount = computed(
	() =>
		hasDiscount.value ||
		itemDiscountTotal.value > 0 ||
		cartStore.hasOffers ||
		cartStore.offerItemDiscountTotal > 0 ||
		cartStore.offerGrandTotalDiscountPct > 0,
);

function clearAllDiscounts() {
	cartStore.clearAllDiscounts();
	discountInput.value = 0;
	showDiscount.value = false;
	showCoupon.value = false;
}

function handleClearCart() {
	if (cartStore.isEmpty) return;
	window.dispatchEvent(new CustomEvent("xpos:clear-cart"));
}

const itemDiscountTotal = computed(() => {
	return cartStore.items.reduce((sum, item) => {
		const itemTotal = item.qty * item.rate;
		if (item.discount_percentage > 0) {
			return sum + Math.abs((itemTotal * item.discount_percentage) / 100);
		}
		return sum + Math.abs(item.discount_amount || 0);
	}, 0);
});

const discountValue = computed(() => {
	if (cartStore.discountPercentage > 0) {
		return (cartStore.subtotal * cartStore.discountPercentage) / 100;
	}
	return cartStore.discountAmount;
});

const payButtonLabel = computed(() => {
	if (cartStore.isEmpty) return __("Add items to pay");
	if (!cartStore.customer) return __("Select customer first");
	if (posStore.enableCashierSettlement && !cartStore.isReturnMode) return __("Send to Cashier");
	const amt = `${money(Math.abs(cartStore.grandTotal))}`;
	return cartStore.isReturnMode ? __("Process Return {0}", [amt]) : __("Pay {0}", [amt]);
});

function handleCheckout() {
	if (posStore.enableCashierSettlement && !cartStore.isReturnMode) {
		sendToCashier();
		return;
	}
	cartStore.openPaymentDialog();
}

function applyDiscount() {
	cartStore.setDiscount(discountType.value as "percentage" | "amount", discountInput.value || 0);
}

async function loadDeliveryCharges(): Promise<DeliveryCharge[]> {
	if (!posStore.profileName || !posStore.companyName) {
		availableDeliveryCharges.value = [];
		return [];
	}

	isLoadingDelivery.value = true;
	try {
		const charges = await offerStore.fetchDeliveryCharges(
			posStore.profileName,
			posStore.companyName,
			cartStore.customer?.name || "",
		);
		availableDeliveryCharges.value = charges;
		return charges;
	} finally {
		isLoadingDelivery.value = false;
	}
}

function syncSelectedDeliveryCharge(charges: DeliveryCharge[]) {
	const currentCharge = cartStore.selectedDeliveryCharge;
	const matchingCharge = currentCharge
		? charges.find((charge) => charge.name === currentCharge.name)
		: undefined;

	if (matchingCharge) {
		cartStore.setDeliveryCharge(matchingCharge);
		return;
	}

	if (currentCharge) {
		cartStore.setDeliveryCharge(null);
		showInfo(
			__("Delivery charge {0} is no longer available and was removed.", [
				currentCharge.label || currentCharge.name,
			]),
		);
	}

	if (posStore.autoSetDeliveryCharges && charges.length > 0) {
		cartStore.setDeliveryCharge(charges[0]);
	}
}

async function syncAutoDeliveryCharge() {
	if (cartStore.isReturnMode || cartStore.isEmpty) {
		availableDeliveryCharges.value = [];
		cartStore.setDeliveryCharge(null);
		return;
	}

	if (!posStore.useDeliveryCharges) {
		availableDeliveryCharges.value = [];
		showDelivery.value = false;
		if (cartStore.selectedDeliveryCharge) {
			cartStore.setDeliveryCharge(null);
			showInfo(__("Delivery charges are disabled for this POS Profile; the charge was removed."));
		}
		return;
	}

	if (!posStore.autoSetDeliveryCharges && !cartStore.selectedDeliveryCharge) {
		return;
	}

	const charges = await loadDeliveryCharges();
	syncSelectedDeliveryCharge(charges);
}

watch(
	[
		() => posStore.useDeliveryCharges,
		() => posStore.autoSetDeliveryCharges,
		() => posStore.profileName,
		() => posStore.companyName,
		() => cartStore.customer?.name || "",
		() => cartStore.isReturnMode,
		() => cartStore.isEmpty,
	],
	() => {
		void syncAutoDeliveryCharge();
	},
	{ immediate: true },
);

watch(
	() => cartStore.isEmpty,
	(empty) => {
		if (!empty) return;
		discountInput.value = 0;
		discountType.value = "percentage";
		couponInput.value = "";
		couponError.value = "";
		showDiscount.value = false;
		showCoupon.value = false;
		showDelivery.value = false;
	},
);

async function toggleDelivery() {
	showDelivery.value = !showDelivery.value;
	if (showDelivery.value) {
		const charges = await loadDeliveryCharges();
		syncSelectedDeliveryCharge(charges);
	}
}

function selectDeliveryCharge(charge: DeliveryCharge) {
	if (cartStore.selectedDeliveryCharge?.name === charge.name) {
		cartStore.setDeliveryCharge(null);
	} else {
		cartStore.setDeliveryCharge(charge);
	}
}

async function applyCouponCode() {
	if (!couponInput.value) return;
	isApplyingCoupon.value = true;
	couponError.value = "";

	try {
		if (offerStore.offers.length === 0) {
			await offerStore.fetchOffers(
				posStore.profileName,
				cartStore.items.map((i) => i.item_code),
				cartStore.customer?.name || "",
			);
		}

		const result = await offerStore.fetchCoupon(
			couponInput.value,
			cartStore.customer?.name || "",
			posStore.companyName,
		);
		if (cartStore.appliedCoupon) cartStore.removeCoupon();
		if (result.coupon) {
			const posOfferName = (result.coupon as Record<string, unknown>).pos_offer as string | undefined;
			const storeOffer = posOfferName
				? offerStore.offers.find((o) => o.name === posOfferName)
				: undefined;
			const linkedOffer = storeOffer || result.offer;
			if (linkedOffer) {
				(result.coupon as Record<string, unknown>)._offer = linkedOffer;
			}
			cartStore.applyCoupon(result.coupon);
			showCoupon.value = false;
			couponInput.value = "";
		} else {
			couponError.value = result.msg || __("Invalid or expired coupon code");
		}
	} catch (error) {
		couponError.value = __("Failed to validate coupon");
	} finally {
		isApplyingCoupon.value = false;
	}
}

function extractErrorMessage(error: unknown): string {
	if (!error) return __("Unknown error");
	if (typeof error === "string") return error;
	const err = error as Record<string, unknown>;
	if (err._server_messages) {
		try {
			const msgs = JSON.parse(err._server_messages as string);
			const parsed = typeof msgs === "string" ? [msgs] : msgs;
			return parsed
				.map((m: string) => {
					try {
						return JSON.parse(m).message || m;
					} catch {
						return m;
					}
				})
				.join(", ");
		} catch {
			/* fallthrough */
		}
	}
	if (err.message && typeof err.message === "string") return err.message;
	if (err.exc_type && typeof err.exc_type === "string") return err.exc_type;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

async function holdOrder() {
	if (cartStore.isEmpty) return;

	const profileName = posStore.profileName;
	const shiftName = posStore.posOpeningShift?.name || "";

	if (!profileName) {
		showError(__("POS Profile is not set. Please close and reopen the shift."));
		return;
	}

	if (!shiftName) {
		showError(__("No open shift found. Please open a shift first."));
		return;
	}

	try {
		const data = cartStore.getInvoiceData(profileName, shiftName);
		if (!data.customer) {
			const bootCustomer = (window.xpos?.boot as Record<string, unknown>)?.sysdefaults as
				| Record<string, string>
				| undefined;
			data.customer = bootCustomer?.customer || "";
		}

		if (!data.customer) {
			showError(__("Please select a customer before holding the order."));
			return;
		}

		if (!data.items || data.items.length === 0) {
			showError(__("No items in cart to save."));
			return;
		}

		if (isElectron() && window.electronAPI?.db) {
			await window.electronAPI.db.addPendingInvoice({
				data: { ...data, is_draft: true, pos_opening_shift_local_id: shiftName },
				customer_name: cartStore.customerName || data.customer,
				grand_total: cartStore.grandTotal || 0,
			});
			cartStore.clearAll();
			showSuccess(__("Order saved as draft locally"));
		} else {
			const serverData = { ...data };
			if (serverData.pos_opening_shift && /^\d+$/.test(String(serverData.pos_opening_shift))) {
				delete serverData.pos_opening_shift;
			}
			if (offlineStore.isOnline) {
				await call("xpos.api.invoices.save_draft_invoice", {
					data: JSON.stringify(serverData),
				});
				cartStore.clearAll();
				showSuccess(__("Order saved as draft"));
			} else {
				await offlineStore.saveOffline(
					{ ...serverData, is_draft: true } as Parameters<typeof offlineStore.saveOffline>[0],
					cartStore.customerName || data.customer,
					cartStore.grandTotal || 0,
				);
				cartStore.clearAll();
				showSuccess(__("No connection – draft saved offline"));
			}
		}
	} catch (error: unknown) {
		if (handleTabConflict(error)) return;
		showError(__("Failed to save draft: {0}", [extractErrorMessage(error)]));
	}
}

function handleTabConflict(error: unknown): boolean {
	if (!isTabConflictError(error)) return false;

	showError(__("This tab was changed on another terminal. Reload it and try again."));
	cartStore.openDraftDialog();
	return true;
}

async function sendToCashier() {
	if (cartStore.isEmpty) return;

	const profileName = posStore.profileName;
	const shiftName = posStore.posOpeningShift?.name || "";

	if (!profileName) {
		showError(__("POS Profile is not set. Please close and reopen the shift."));
		return;
	}

	if (!shiftName) {
		showError(__("No open shift found. Please open a shift first."));
		return;
	}

	try {
		const data = cartStore.getInvoiceData(profileName, shiftName);
		data.pos_awaiting_settlement = true;

		if (!data.customer) {
			const bootCustomer = (window.xpos?.boot as Record<string, unknown>)?.sysdefaults as
				| Record<string, string>
				| undefined;
			data.customer = bootCustomer?.customer || "";
		}

		if (!data.customer) {
			showError(__("Please select a customer before sending to cashier."));
			return;
		}

		if (!data.items || data.items.length === 0) {
			showError(__("No items in cart to send."));
			return;
		}

		if (isElectron() && window.electronAPI?.db) {
			const result = await window.electronAPI.db.addPendingInvoice({
				data: {
					...data,
					is_draft: true,
					pos_opening_shift_local_id: shiftName,
					receipt: cartStore.getReceiptSnapshot("", authStore.userFullName),
				},
				customer_name: cartStore.customerName || data.customer,
				grand_total: cartStore.grandTotal || 0,
			});
			if (posStore.printBackupReceipt && result?.id) {
				await printInvoiceLocal(result.id);
			}
			cartStore.clearAll();
			showSuccess(__("Sent to cashier"));
		} else {
			const serverData = { ...data };
			if (serverData.pos_opening_shift && /^\d+$/.test(String(serverData.pos_opening_shift))) {
				delete serverData.pos_opening_shift;
			}
			if (offlineStore.isOnline) {
				const result = await call<{ name: string }>("xpos.api.invoices.save_draft_invoice", {
					data: JSON.stringify(serverData),
				});
				if (posStore.printBackupReceipt && result?.name) {
					await printInvoice(result.name);
				}
				cartStore.clearAll();
				showSuccess(__("Sent to cashier"));
			} else {
				await offlineStore.saveOffline(
					{ ...serverData, is_draft: true } as Parameters<typeof offlineStore.saveOffline>[0],
					cartStore.customerName || data.customer,
					cartStore.grandTotal || 0,
				);
				cartStore.clearAll();
				showSuccess(__("No connection – will sync to cashier when back online"));
			}
		}
	} catch (error: unknown) {
		if (handleTabConflict(error)) return;
		showError(__("Failed to send to cashier: {0}", [extractErrorMessage(error)]));
	}
}
</script>
