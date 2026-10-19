<template>
	<div class="relative">
		<!-- Invisible dock trigger: desktop web pointers only -->
		<div
			v-if="canDock && !isOpen"
			class="fixed start-0 top-14 bottom-0 z-40 w-1.5"
			aria-hidden="true"
			data-testid="sidebar-hot-zone"
			@mouseenter="schedulePeek"
			@mouseleave="cancelPeek"
		/>

		<Transition name="fade">
			<div v-if="mode === 'pinned'" class="fixed inset-0 bg-scrim/40 z-40" @click="close" />
		</Transition>

		<Transition name="slide">
			<aside
				v-show="isOpen"
				ref="asideRef"
				:aria-label="__('Navigation')"
				:class="
					cn(
						'fixed z-50 flex w-64 flex-col border border-border bg-card text-card-foreground shadow-overlay',
						canDock
							? 'start-2 top-18 bottom-2 rounded-xl'
							: 'start-0 top-0 h-full border-y-0 border-s-0',
					)
				"
				@mouseenter="cancelHide"
				@mouseleave="scheduleHide"
				@focusin="cancelHide"
				@focusout="onFocusOut"
			>
				<div class="p-4 border-b border-border flex items-center gap-3">
					<XposLogo variant="full" :size="32" :subtitle="posStore.companyName" />
				</div>

				<ScrollArea class="flex-1">
					<nav class="p-2">
						<template v-for="(group, index) in navGroups" :key="group.label">
							<p
								:class="
									cn(
										'px-3 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide',
										index === 0 ? 'pt-2' : 'pt-4',
									)
								"
							>
								{{ group.label }}
							</p>
							<router-link
								v-for="item in group.items"
								:key="item.route"
								:to="item.route"
								:aria-current="isActive(item.route) ? 'page' : undefined"
								@click="close"
								:class="
									cn(
										'relative flex min-h-control items-center gap-3 rounded-lg px-3 text-sm no-underline transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
										isActive(item.route)
											? 'bg-surface-selected font-semibold text-surface-selected-foreground before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-primary'
											: 'font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground',
									)
								"
							>
								<component :is="item.icon" class="w-4 h-4 shrink-0" />
								<span>{{ item.label }}</span>
							</router-link>
						</template>
					</nav>
				</ScrollArea>

				<div class="p-3 border-t border-border">
					<div class="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
						<Building2 class="w-4 h-4 shrink-0" />
						<span class="truncate">{{ posStore.warehouse }}</span>
					</div>
				</div>
			</aside>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { cn } from "@/lib/utils";
import { __ } from "@/lib/translate";
import { hasPermission } from "@/services/userRights";
import { ScrollArea } from "@/components/ui/scroll-area";
import { XposLogo } from "@/components/ui/brand";
import {
	LayoutGrid,
	FileText,
	ShoppingBag,
	ClipboardList,
	PackageCheck,
	Printer,
	Building2,
	Receipt,
	Settings,
	Wallet,
	Landmark,
	BarChart3,
	Banknote,
	ScanBarcode,
	ScrollText,
} from "lucide-vue-next";

import { isElectron } from "@/services/electronBridge";

const route = useRoute();
const posStore = usePosStore();

/**
 * "peek": revealed by hovering the inline-start edge (desktop web), no backdrop, hides on leave.
 * "pinned": opened via the hamburger / bottom-nav toggle event, modal-style with a backdrop.
 */
const mode = ref<"closed" | "peek" | "pinned">("closed");
const isOpen = computed(() => mode.value !== "closed");
const asideRef = ref<HTMLElement | null>(null);

const DOCK_QUERY = "(hover: hover) and (pointer: fine) and (min-width: 768px)";
const dockMedia = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(DOCK_QUERY) : null;
const pointerCanDock = ref(!!dockMedia?.matches);
const canDock = computed(() => pointerCanDock.value && !isElectron());

let peekTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let returnFocusTo: HTMLElement | null = null;

function schedulePeek() {
	clearTimeout(peekTimer);
	peekTimer = setTimeout(() => {
		if (mode.value === "closed") mode.value = "peek";
	}, 150);
}

function cancelPeek() {
	clearTimeout(peekTimer);
}

function cancelHide() {
	clearTimeout(hideTimer);
}

function scheduleHide() {
	if (mode.value !== "peek") return;
	clearTimeout(hideTimer);
	hideTimer = setTimeout(() => {
		if (mode.value === "peek" && !asideRef.value?.contains(document.activeElement)) close();
	}, 300);
}

function onFocusOut(event: FocusEvent) {
	if (!asideRef.value?.contains(event.relatedTarget as Node | null)) scheduleHide();
}

function close() {
	cancelPeek();
	cancelHide();
	const wasPinned = mode.value === "pinned";
	mode.value = "closed";
	if (wasPinned && returnFocusTo?.isConnected) returnFocusTo.focus();
	returnFocusTo = null;
}

function handleToggleSidebar() {
	if (mode.value === "pinned") {
		close();
		return;
	}
	returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	mode.value = "pinned";
	nextTick(() => asideRef.value?.querySelector<HTMLElement>("a[href]")?.focus());
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape" && isOpen.value) close();
}

function handleDockMediaChange(event: MediaQueryListEvent) {
	pointerCanDock.value = event.matches;
}

// Touch devices: swipe in from the inline-start edge to open, like the hover dock on desktop.
let swipeStart: { x: number; y: number } | null = null;

function handleTouchStart(event: TouchEvent) {
	if (canDock.value || isOpen.value || isElectron()) return;
	const touch = event.touches[0];
	const rtl = document.documentElement.dir === "rtl";
	const fromEdge = rtl ? window.innerWidth - touch.clientX : touch.clientX;
	swipeStart = fromEdge <= 20 ? { x: touch.clientX, y: touch.clientY } : null;
}

function handleTouchEnd(event: TouchEvent) {
	if (!swipeStart) return;
	const touch = event.changedTouches[0];
	const rtl = document.documentElement.dir === "rtl";
	const dx = (touch.clientX - swipeStart.x) * (rtl ? -1 : 1);
	const dy = Math.abs(touch.clientY - swipeStart.y);
	swipeStart = null;
	if (dx > 60 && dy < dx) handleToggleSidebar();
}

onMounted(() => {
	window.addEventListener("xpos:toggle-sidebar", handleToggleSidebar);
	window.addEventListener("keydown", handleKeydown);
	window.addEventListener("touchstart", handleTouchStart, { passive: true });
	window.addEventListener("touchend", handleTouchEnd, { passive: true });
	dockMedia?.addEventListener("change", handleDockMediaChange);
});

onUnmounted(() => {
	window.removeEventListener("xpos:toggle-sidebar", handleToggleSidebar);
	window.removeEventListener("keydown", handleKeydown);
	window.removeEventListener("touchstart", handleTouchStart);
	window.removeEventListener("touchend", handleTouchEnd);
	dockMedia?.removeEventListener("change", handleDockMediaChange);
	cancelPeek();
	cancelHide();
});

const mainNavItems = computed(() => [
	{ route: "/pos", label: __("POS"), icon: LayoutGrid, show: true },
	{ route: "/orders", label: __("Orders"), icon: FileText, show: true },
	{
		route: "/sales-orders",
		label: __("Sales Orders"),
		icon: ScrollText,
		show: posStore.allowSalesOrder,
	},
	{
		route: "/cashier",
		label: __("Cashier"),
		icon: Banknote,
		show: posStore.enableCashierSettlement && posStore.isCashier,
	},
	{ route: "/reports", label: __("Reports"), icon: BarChart3, show: true },
]);

const purchaseNavItems = [
	{ route: "/purchase-order", label: __("Purchase Order"), icon: ClipboardList },
	{ route: "/purchase-invoices", label: __("Purchase Invoice"), icon: Receipt },
	{ route: "/stock-receiving", label: __("Stock Receiving"), icon: PackageCheck },
];

const toolsNavItems = [
	{ route: "/price-checker", label: __("Price Checker"), icon: ScanBarcode, show: true },
	{ route: "/barcode-print", label: __("Barcode Printer"), icon: Printer, show: true },
	{ route: "/settings", label: __("Settings"), icon: Settings, show: isElectron() },
];

const financeNavItems = computed(() => [
	{
		route: "/expenses",
		label: __("Expenses"),
		icon: Wallet,
		show: hasPermission("expense") && posStore.allowPosExpense,
	},
	{
		route: "/bank-drops",
		label: __("Bank Drops"),
		icon: Landmark,
		show: hasPermission("bank_drop") && posStore.allowCashDeposit,
	},
]);

const navGroups = computed(() =>
	[
		{ label: __("Main"), items: mainNavItems.value.filter((it) => it.show) },
		{ label: __("Purchasing"), items: purchaseNavItems },
		{ label: __("Finance"), items: financeNavItems.value.filter((it) => it.show) },
		{ label: __("Tools"), items: toolsNavItems.filter((it) => it.show) },
	].filter((group) => group.items.length),
);

function isActive(path: string): boolean {
	if (path === "/reports") {
		return route.path === path || route.path.startsWith("/reports/");
	}
	if (path === "/purchase-invoices") {
		return route.path === "/purchase-invoices" || route.path === "/purchase-invoice";
	}
	return route.path === path;
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition:
		transform var(--duration-base) var(--ease-standard),
		opacity var(--duration-base) var(--ease-standard);
}

.slide-enter-from,
.slide-leave-to {
	opacity: 0;
	transform: translateX(-100%);
}

[dir="rtl"] .slide-enter-from,
[dir="rtl"] .slide-leave-to {
	transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity var(--duration-base) ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
