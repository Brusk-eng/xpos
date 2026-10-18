<template>
	<div class="flex flex-col h-full">
		<div
			v-if="cartStore.isReturnMode"
			class="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between"
		>
			<div class="flex items-center gap-2">
				<RotateCcw class="w-4 h-4 text-amber-600" />
				<span class="text-sm font-semibold text-amber-700 dark:text-amber-400">{{
					__("Return Mode")
				}}</span>
				<span
					v-if="cartStore.returnAgainst"
					class="text-xs text-amber-600/70 dark:text-amber-400/70 font-mono"
				>
					{{ cartStore.returnAgainst }}
				</span>
			</div>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-amber-600 hover:text-amber-700"
				@click="cartStore.exitReturnMode()"
			>
				<X class="w-4 h-4" />
			</Button>
		</div>

		<div class="shrink-0 space-y-2.5 px-4 pt-3 pb-2">
			<div class="flex items-center justify-between gap-3">
				<h2 class="flex shrink-0 items-center gap-2.5 text-lg font-bold text-foreground">
					<ShoppingCart class="size-6 text-primary" />
					{{ __("Current sale") }}
					<span
						class="rounded-lg border border-border bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-muted-foreground tabular-nums"
						data-testid="cart-item-count"
					>
						{{ unitsLabel }} &middot; {{ productsLabel }}
					</span>
				</h2>
				<Autocomplete
					v-if="posStore.salesPersonEnabled && !cartStore.isReturnMode"
					v-model="cartStore.salesPerson"
					doctype="Sales Person"
					query="xpos.api.customers.sales_person_query"
					:filters="{ pos_profile: posStore.profileName }"
					:placeholder="__('Sales Person')"
					:open-on-focus="true"
					:clearable="true"
					:min-chars="0"
					class="min-w-0 max-w-52 flex-1"
				/>
			</div>

			<div
				class="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-2.5 shadow-raised"
				:class="cartStore.isReturnMode && 'bg-muted'"
			>
				<button
					type="button"
					class="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed"
					:disabled="cartStore.isReturnMode"
					@click="handleCustomerClick"
				>
					<Avatar class="size-10">
						<img
							v-if="cartStore.customer && cartStore.customer.image"
							:src="cartStore.customer.image as string"
							:alt="cartStore.customer.customer_name"
							class="h-full w-full object-cover"
							loading="lazy"
						/>
						<AvatarFallback>
							<User class="size-5" />
						</AvatarFallback>
					</Avatar>
					<div class="min-w-0 flex-1">
						<p class="truncate text-base font-semibold text-foreground">
							{{ cartStore.customerName }}
						</p>
						<p class="truncate text-sm text-muted-foreground">
							<template v-if="cartStore.isReturnMode">{{
								__("Customer locked for return")
							}}</template>
							<template v-else-if="!cartStore.customer">{{
								__("Click to select customer")
							}}</template>
							<template v-else-if="cartStore.customer.mobile_no || cartStore.customer.email_id">
								{{ cartStore.customer.mobile_no || cartStore.customer.email_id }}
							</template>
							<template v-else>{{ __("Customer") }}</template>
						</p>
					</div>
				</button>
				<Lock v-if="cartStore.isReturnMode" class="size-5 shrink-0 text-muted-foreground" />
				<template v-else>
					<TooltipWrapper v-if="cartStore.customer" :content="__('Loyalty Program')">
						<Button
							variant="ghost"
							size="icon"
							:aria-label="__('Loyalty Program')"
							@click="customerStore.showLoyaltyDialog = true"
						>
							<Gift class="size-5!" />
						</Button>
					</TooltipWrapper>
					<TooltipWrapper v-if="cartStore.customer" :content="__('Edit Customer')">
						<Button
							variant="ghost"
							size="icon"
							:aria-label="__('Edit Customer')"
							@click="handleEditCustomer"
						>
							<Pencil class="size-5!" />
						</Button>
					</TooltipWrapper>
					<Button
						variant="secondary"
						class="h-10 shrink-0 rounded-xl border-transparent bg-accent px-4 font-semibold text-accent-foreground hover:bg-accent/80"
						@click="handleCustomerClick"
					>
						{{ cartStore.customer ? __("Change") : __("Select") }}
					</Button>
				</template>
			</div>

			<div
				v-if="showCreditInfo"
				class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-sm"
				:class="
					isOverCreditLimit
						? 'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground'
						: 'border-border bg-surface-sunken'
				"
			>
				<span>
					<span class="text-muted-foreground">{{ __("Balance") }}</span>
					<span class="ms-1.5 font-bold tabular-nums">{{ money(customerBalance ?? 0) }}</span>
				</span>
				<span>
					<span class="text-muted-foreground">{{ __("Credit Limit") }}</span>
					<span class="ms-1.5 font-bold tabular-nums">
						{{ customerCreditLimit > 0 ? money(customerCreditLimit) : __("No Limit") }}
					</span>
				</span>
				<p v-if="isOverCreditLimit" class="flex w-full items-center gap-1.5 text-xs font-semibold">
					<AlertTriangle class="w-3.5 h-3.5 shrink-0" />
					{{
						__("This sale exceeds the credit limit by {0}", [
							money(projectedBalance - customerCreditLimit),
						])
					}}
				</p>
			</div>
		</div>

		<div ref="cartScrollContainer" class="flex-1 overflow-y-auto px-4 xpos-scrollbar">
			<EmptyState
				v-if="cartStore.isEmpty"
				:icon="ShoppingCart"
				:title="__('Cart is empty')"
				:description="__('Click on items to add them here')"
				class="h-full"
			/>

			<div v-else class="space-y-3 py-1">
				<CartItem
					v-for="(item, index) in cartStore.items"
					:key="
						item.item_code +
						'-' +
						(item.serial_no || '') +
						'-' +
						(item.batch_no || '') +
						'-' +
						index
					"
					:item="item"
					:index="index"
					:currency-symbol="posStore.currencySymbol"
					@update-qty="handleUpdateQty"
					@update-rate="cartStore.updateItemRate"
					@update-discount="cartStore.updateItemDiscount"
					@update-uom="cartStore.updateItemUOM"
					@remove="cartStore.removeItem"
				/>
			</div>
		</div>

		<div
			v-if="posStore.displayAdditionalNotes && !cartStore.isEmpty"
			class="shrink-0 px-4 py-2 border-t border-border"
		>
			<textarea
				v-model="cartStore.orderNotes"
				rows="2"
				placeholder="Add order notes..."
				class="w-full text-xs rounded-md border border-input bg-background px-3 py-1.5 ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
			/>
		</div>

		<div v-if="cartStore.hasOffers && !cartStore.isEmpty" class="shrink-0 px-4 pb-2 space-y-1">
			<div
				v-for="offer in cartStore.appliedOffers"
				:key="offer.name"
				class="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs"
			>
				<span class="text-emerald-700 dark:text-emerald-400 font-medium">
					{{ offer.offer_name || offer.name }}
				</span>
				<button
					@click="cartStore.removeOffer(offer.name)"
					class="text-muted-foreground hover:text-destructive"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
			<div
				v-if="cartStore.appliedCoupon"
				class="flex items-center justify-between bg-violet-500/5 border border-violet-500/20 rounded-lg px-3 py-1.5 text-xs"
			>
				<span class="text-violet-700 dark:text-violet-400 font-medium">
					{{ __("Coupon") }}:
					{{ cartStore.appliedCoupon.coupon_code || cartStore.appliedCoupon.name }}
				</span>
				<button
					@click="cartStore.removeCoupon()"
					class="text-muted-foreground hover:text-destructive"
				>
					<X class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<CartSummary />
		<CustomerEditDialog />
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { showError } from "@/services/api";
import { useMoney } from "@/composables/useMoney";
import CartItem from "./CartItem.vue";
import CartSummary from "./CartSummary.vue";
import { Button } from "@/components/ui/button";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/state";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { ShoppingCart, User, RotateCcw, X, Lock, Gift, Pencil, AlertTriangle } from "lucide-vue-next";
import __ from "@/lib/translate";
import CustomerEditDialog from "@/components/dialogs/CustomerEditDialog.vue";

const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
const { money, qty } = useMoney();

const cartScrollContainer = ref<HTMLElement | null>(null);

onMounted(() => {
	window.addEventListener("xpos:focus-cart-item", handleFocusCartItem);
});

onUnmounted(() => {
	window.removeEventListener("xpos:focus-cart-item", handleFocusCartItem);
});

function handleFocusCartItem() {
	if (cartStore.isEmpty) return;
	const firstItemEl = document.querySelector('[data-cart-index="0"]');
	const allInputs = firstItemEl?.querySelectorAll('input[type="number"]');
	if (!allInputs || allInputs.length === 0) return;
	const qtyEl = (allInputs.length > 1 ? allInputs[1] : allInputs[0]) as HTMLInputElement;
	qtyEl.focus();
	qtyEl.select();
}

watch(
	() => cartStore.items.length,
	(newLen, oldLen) => {
		if (newLen > oldLen) {
			nextTick(() => {
				const container = cartScrollContainer.value;
				if (!container) return;

				container.scrollTo({
					top: container.scrollHeight,
					behavior: "smooth",
				});

				const rows = container.querySelectorAll<HTMLElement>("[data-cart-index]");
				const lastChild = rows[rows.length - 1];
				if (lastChild) {
					lastChild.classList.add("ring-2", "ring-primary/50");
					setTimeout(() => {
						lastChild.classList.remove("ring-2", "ring-primary/50");
					}, 800);
				}
			});
		}
	},
);

watch(
	() => cartStore.customer?.name,
	(name) => {
		if (name && posStore.showCustomerBalance) customerStore.getCustomerInfo(name);
	},
	{ immediate: true },
);

const unitsLabel = computed(() => {
	const units = cartStore.items.reduce((sum, item) => sum + Math.abs(Number(item.qty) || 0), 0);
	return units === 1 ? __("1 unit") : __("{0} units", [qty(units)]);
});
const productsLabel = computed(() => {
	const products = new Set(cartStore.items.map((item) => item.item_code)).size;
	return products === 1 ? __("1 product") : __("{0} products", [products]);
});

const customerFinancials = computed(() =>
	cartStore.customer && customerStore.selectedCustomerInfo?.name === cartStore.customer.name
		? customerStore.selectedCustomerInfo
		: null,
);
const customerBalance = computed(() => customerFinancials.value?.balance ?? null);
const customerCreditLimit = computed(() => customerFinancials.value?.credit_limit ?? 0);
const projectedBalance = computed(() => (customerBalance.value ?? 0) + Math.max(cartStore.grandTotal, 0));
const isOverCreditLimit = computed(
	() => customerCreditLimit.value > 0 && projectedBalance.value > customerCreditLimit.value,
);
const showCreditInfo = computed(
	() =>
		posStore.showCustomerBalance &&
		!cartStore.isReturnMode &&
		((customerBalance.value ?? 0) > 0 || customerCreditLimit.value > 0),
);

function handleCustomerClick() {
	if (cartStore.isReturnMode) {
		showError(__("Customer cannot be changed in return mode"));
		return;
	}
	customerStore.showCustomerDialog = true;
	customerStore.searchCustomers();
}

function handleEditCustomer() {
	customerStore.showCustomerEditDialog = true;
}

function handleUpdateQty(index: number, qty: number) {
	const result = cartStore.updateItemQty(index, qty);
	if (!result.success && result.message) {
		showError(result.message);
	}
}
</script>
