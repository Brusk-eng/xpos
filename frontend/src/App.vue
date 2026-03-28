<template>
	<div
		id="xpos-app"
		:class="[
			'h-screen w-screen font-sans',
			isDark ? 'dark' : '',
			isAuthPage ? 'overflow-y-auto' : 'overflow-hidden',
			isRtl ? 'rtl' : 'ltr',
		]"
	>
		<template v-if="isAuthPage">
			<router-view v-slot="{ Component }">
				<transition name="fade" mode="out-in">
					<component :is="Component" />
				</transition>
			</router-view>
		</template>

		<template v-else>
			<div v-if="posStore.isLoading" class="flex items-center justify-center h-full bg-background">
				<div class="text-center">
					<div class="relative w-16 h-16 mx-auto mb-4">
						<div class="absolute inset-0 rounded-full border-4 border-muted"></div>
						<div
							class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
						></div>
					</div>
					<h2 class="text-xl font-semibold text-foreground">Loading X POS</h2>
					<p class="text-muted-foreground mt-1">Preparing your workspace...</p>
				</div>
			</div>

			<OpeningDialog v-else-if="posStore.showOpeningDialog" />

			<DefaultLayout v-else-if="posStore.isReady">
				<router-view v-slot="{ Component }">
					<transition name="fade" mode="out-in">
						<component :is="Component" />
					</transition>
				</router-view>
			</DefaultLayout>

			<ClosingDialog v-if="posStore.showClosingDialog" />

			<PaymentDialog v-if="cartStore.showPaymentDialog" />

			<CustomerSelect v-if="customerStore.showCustomerDialog" />

			<LoyaltyDialog v-if="customerStore.showLoyaltyDialog" />

			<ItemDetailDialog v-if="itemStore.showItemDetail" />

			<CashMovementDialog v-if="paymentStore.showCashMovementDialog" />

			<DraftInvoiceDialog v-if="cartStore.showDraftDialog" />

			<KeyboardShortcutsDialog :open="showShortcutsDialog" @close="showShortcutsDialog = false" />
			<AboutDialog :open="showAboutDialog" @close="showAboutDialog = false" />
		</template>

		<Toaster
			:theme="isDark ? 'dark' : 'light'"
			:position="isRtl ? 'bottom-left' : 'bottom-right'"
			:duration="4000"
			:expand="true"
			rich-colors
			close-button
			:dir="isRtl ? 'rtl' : 'ltr'"
		/>

		<Transition name="fade">
			<TooltipWrapper
				v-if="!isAuthPage && isElectronEnv"
				:content="
					syncStatus.lastError.value ||
					(syncStatus.lastSyncTime.value
						? 'Last sync: ' + syncStatus.lastSyncTime.value
						: 'Not synced yet')
				"
				side="right"
			>
				<div
					class="fixed bottom-3 start-3 z-50 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-md select-none"
					:class="
						syncStatus.isSyncing.value
							? 'bg-blue-600 text-white'
							: syncStatus.lastError.value
								? 'bg-destructive text-destructive-foreground'
								: 'bg-muted text-muted-foreground'
					"
				>
					<span
						v-if="syncStatus.isSyncing.value"
						class="w-2 h-2 rounded-full bg-white animate-ping"
					/>
					<span
						v-else
						class="w-2 h-2 rounded-full"
						:class="syncStatus.lastError.value ? 'bg-white' : 'bg-green-400'"
					/>
					<span>
						<template v-if="syncStatus.isSyncing.value">
							Syncing{{
								syncStatus.syncTable.value ? ": " + syncStatus.syncTable.value : "..."
							}}
						</template>
						<template v-else-if="syncStatus.lastError.value">Sync error</template>
						<template v-else-if="syncStatus.lastSyncTime.value"
							>Synced {{ syncStatus.lastSyncTime.value }}</template
						>
						<template v-else>Sync pending</template>
					</span>
				</div>
			</TooltipWrapper>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Toaster } from "vue-sonner";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useCustomerStore } from "@/stores/customerStore";
import { useItemStore } from "@/stores/itemStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import DefaultLayout from "@/layouts/DefaultLayout.vue";
import OpeningDialog from "@/components/shift/OpeningDialog.vue";
import ClosingDialog from "@/components/shift/ClosingDialog.vue";
import PaymentDialog from "@/components/payment/PaymentDialog.vue";
import CustomerSelect from "@/components/customer/CustomerSelect.vue";
import LoyaltyDialog from "@/components/customer/LoyaltyDialog.vue";
import ItemDetailDialog from "@/components/items/ItemDetailDialog.vue";
import CashMovementDialog from "@/components/shift/CashMovementDialog.vue";
import DraftInvoiceDialog from "@/components/cart/DraftInvoiceDialog.vue";
import KeyboardShortcutsDialog from "@/components/KeyboardShortcutsDialog.vue";
import AboutDialog from "@/components/AboutDialog.vue";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { useOfflineStore } from "@/stores/offlineStore";
import { initSyncListeners } from "@/services/syncIpcHandler";
import { useSyncStatus } from "@/composables/useSyncStatus";
import { useKeyboardShortcuts } from "@/composables/useKeyboardShortcuts";
import { isElectron } from "@/services/electronBridge";
import { get_full_url } from "@/utils";
import { getCustomer } from "./utils";

const route = useRoute();
const posStore = usePosStore();
const cartStore = useCartStore();
const customerStore = useCustomerStore();
const itemStore = useItemStore();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();
const offlineStore = useOfflineStore();
const syncStatus = useSyncStatus();
const isElectronEnv = isElectron();
const isRtl = computed(() => document.documentElement.dir === "rtl");

const keyboardShortcuts = useKeyboardShortcuts();
const {
	showShortcutsDialog,
	showAboutDialog,
	init: initKeyboardShortcuts,
	destroy: destroyKeyboardShortcuts,
} = keyboardShortcuts;

const isAuthPage = computed(() => route.meta.isAuthPage === true || route.meta.isSetupPage === true);

async function handleClearCart() {
	cartStore.clearCart();
	if (!cartStore.customer && posStore.defaultCustomer) {
		const customer = await getCustomer(posStore.defaultCustomer);
		cartStore.setCustomer(customer as any);
	}
}

function handleProcessPayment() {
	if (cartStore.items.length > 0 && posStore.isShiftOpen) {
		cartStore.showPaymentDialog = true;
	}
}

function handleSelectCustomer() {
	customerStore.showCustomerDialog = true;
}

function handleShowDrafts() {
	cartStore.showDraftDialog = true;
}

function handleHoldInvoice() {
	if (cartStore.items.length > 0) {
		cartStore.openDraftDialog();
	}
}

function handleRemoveLastItem() {
	if (cartStore.items.length > 0) {
		cartStore.removeItem(cartStore.items.length - 1);
	}
}

function handleCloseShift() {
	if (posStore.isShiftOpen) {
		posStore.showClosingDialog = true;
		posStore.fetchClosingData();
	}
}

function handleCashExpense() {
	if (posStore.allowPosExpense && posStore.isShiftOpen) {
		paymentStore.openCashMovement("expense");
	}
}

function handleCashDeposit() {
	if (posStore.allowCashDeposit && posStore.isShiftOpen) {
		paymentStore.openCashMovement("deposit");
	}
}

function handlePrintLast() {
	const name = posStore.lastInvoiceName;
	if (!name) return;
	window.open(
		get_full_url(
			`/printview?doctype=${posStore.invoiceType}&name=${name}&format=${posStore.defaultPrintFormat}&no_letterhead=0&trigger_print=1`,
		),
		"_blank",
	);
}

function handleShowShortcutsDialog() {
	showShortcutsDialog.value = true;
}

function handleShowAboutDialog() {
	showAboutDialog.value = true;
}

const theme = ref<"light" | "dark" | "system">("system");
const systemPrefersDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);

const isDark = computed(() => {
	if (theme.value === "system") {
		return systemPrefersDark.value;
	}
	return theme.value === "dark";
});

function applyThemeToDocument(dark: boolean) {
	const html = document.documentElement;
	if (dark) {
		html.classList.add("dark");
		html.classList.remove("light");
	} else {
		html.classList.add("light");
		html.classList.remove("dark");
	}
}

watch(
	isDark,
	(dark) => {
		applyThemeToDocument(dark);
	},
	{ immediate: true },
);

function toggleDarkMode() {
	if (theme.value === "light") {
		theme.value = "dark";
	} else if (theme.value === "dark") {
		theme.value = "system";
	} else {
		theme.value = "light";
	}
	localStorage.setItem("xpos-theme", theme.value);
}

provide("isDark", isDark);
provide("theme", theme);
provide("toggleDarkMode", toggleDarkMode);

let mediaQuery: MediaQueryList | null = null;
let cleanupSyncListeners: (() => void) | null = null;
function handleSystemThemeChange(e: MediaQueryListEvent) {
	systemPrefersDark.value = e.matches;
}

onMounted(() => {
	const saved = localStorage.getItem("xpos-theme") as "light" | "dark" | "system" | null;
	if (saved && ["light", "dark", "system"].includes(saved)) {
		theme.value = saved;
	} else {
		const oldSaved = localStorage.getItem("xpos-dark-mode");
		if (oldSaved === "1") {
			theme.value = "dark";
		} else if (oldSaved === "0") {
			theme.value = "light";
		}
		localStorage.setItem("xpos-theme", theme.value);
	}

	applyThemeToDocument(isDark.value);

	mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	mediaQuery.addEventListener("change", handleSystemThemeChange);

	if (!isAuthPage.value) {
		posStore.checkExistingShift();
	}

	offlineStore.init();
	cleanupSyncListeners = initSyncListeners();
	initKeyboardShortcuts();

	window.addEventListener("xpos:clear-cart", handleClearCart as EventListener);
	window.addEventListener("xpos:process-payment", handleProcessPayment as EventListener);
	window.addEventListener("xpos:select-customer", handleSelectCustomer as EventListener);
	window.addEventListener("xpos:show-drafts", handleShowDrafts as EventListener);
	window.addEventListener("xpos:hold-invoice", handleHoldInvoice as EventListener);
	window.addEventListener("xpos:remove-last-item", handleRemoveLastItem as EventListener);
	window.addEventListener("xpos:close-shift", handleCloseShift as EventListener);
	window.addEventListener("xpos:cash-expense", handleCashExpense as EventListener);
	window.addEventListener("xpos:cash-deposit", handleCashDeposit as EventListener);
	window.addEventListener("xpos:print-last", handlePrintLast as EventListener);
	window.addEventListener("xpos:show-shortcuts-dialog", handleShowShortcutsDialog as EventListener);
	window.addEventListener("xpos:show-about-dialog", handleShowAboutDialog as EventListener);
});

watch(isAuthPage, (isAuth, wasAuth) => {
	if (wasAuth && !isAuth && authStore.isAuthenticated) {
		posStore.checkExistingShift();
	}
});

watch(
	() => posStore.isReady,
	async (ready, wasReady) => {
		if (wasReady && !ready) {
			cartStore.clearAll();
		}
		if (ready && !wasReady) {
			if (!cartStore.customer && posStore.defaultCustomer) {
				const customer = await getCustomer(posStore.defaultCustomer);
				cartStore.setCustomer(customer as any);
			}
		}
	},
);

onUnmounted(() => {
	if (mediaQuery) {
		mediaQuery.removeEventListener("change", handleSystemThemeChange);
	}
	if (cleanupSyncListeners) {
		cleanupSyncListeners();
	}
	offlineStore.destroy();
	destroyKeyboardShortcuts();

	window.removeEventListener("xpos:clear-cart", handleClearCart as EventListener);
	window.removeEventListener("xpos:process-payment", handleProcessPayment as EventListener);
	window.removeEventListener("xpos:select-customer", handleSelectCustomer as EventListener);
	window.removeEventListener("xpos:show-drafts", handleShowDrafts as EventListener);
	window.removeEventListener("xpos:hold-invoice", handleHoldInvoice as EventListener);
	window.removeEventListener("xpos:remove-last-item", handleRemoveLastItem as EventListener);
	window.removeEventListener("xpos:close-shift", handleCloseShift as EventListener);
	window.removeEventListener("xpos:cash-expense", handleCashExpense as EventListener);
	window.removeEventListener("xpos:cash-deposit", handleCashDeposit as EventListener);
	window.removeEventListener("xpos:print-last", handlePrintLast as EventListener);
	window.removeEventListener("xpos:show-shortcuts-dialog", handleShowShortcutsDialog as EventListener);
	window.removeEventListener("xpos:show-about-dialog", handleShowAboutDialog as EventListener);
});
</script>
