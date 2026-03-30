<template>
	<div class="relative">
		<button
			@click="isOpen = !isOpen"
			class="fixed start-0 top-1/2 -translate-y-1/2 z-50 bg-primary text-primary-foreground p-1.5 ltr:rounded-r-md rtl:rounded-l-md shadow-lg hover:bg-primary/90 transition-all"
			:class="{ 'start-64': isOpen }"
		>
			<component :is="toggleIcon" class="w-4 h-4" />
		</button>

		<Transition name="fade">
			<div v-if="isOpen" class="fixed inset-0 bg-black/50 z-40" @click="isOpen = false" />
		</Transition>

		<Transition name="slide">
			<aside
				v-show="isOpen"
				class="fixed start-0 top-0 h-full w-64 bg-card ltr:border-r rtl:border-l border-border z-50 flex flex-col shadow-xl"
			>
				<div class="p-4 border-b border-border flex items-center gap-3">
					<img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-8 h-8" />
					<div>
						<h1 class="font-semibold text-foreground">X POS</h1>
						<p class="text-xs text-muted-foreground">{{ posStore.companyName }}</p>
					</div>
				</div>

				<ScrollArea class="flex-1">
					<nav class="p-2 space-y-1">
						<p
							class="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
						>
							{{ __("Main") }}
						</p>
						<router-link
							v-for="item in mainNavItems"
							:key="item.route"
							:to="item.route"
							@click="isOpen = false"
							:class="
								cn(
									'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
									isActive(item.route)
										? 'bg-primary/10 text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground',
								)
							"
						>
							<component :is="item.icon" class="w-4 h-4 shrink-0" />
							<span>{{ item.label }}</span>
						</router-link>

						<p
							class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
						>
							{{ __("Purchasing") }}
						</p>
						<router-link
							v-for="item in purchaseNavItems"
							:key="item.route"
							:to="item.route"
							@click="isOpen = false"
							:class="
								cn(
									'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
									isActive(item.route)
										? 'bg-primary/10 text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground',
								)
							"
						>
							<component :is="item.icon" class="w-4 h-4 shrink-0" />
							<span>{{ item.label }}</span>
						</router-link>

						<template v-if="financeNavItems.some((it) => it.show)">
							<p
								class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
							>
								{{ __("Finance") }}
							</p>
							<router-link
								v-for="item in financeNavItems.filter((it) => it.show)"
								:key="item.route"
								:to="item.route"
								@click="isOpen = false"
								:class="
									cn(
										'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
										isActive(item.route)
											? 'bg-primary/10 text-primary'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground',
									)
								"
							>
								<component :is="item.icon" class="w-4 h-4 shrink-0" />
								<span>{{ item.label }}</span>
							</router-link>
						</template>

						<p
							class="px-3 py-2 pt-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
						>
							{{ __("Tools") }}
						</p>
						<router-link
							v-for="item in toolsNavItems.filter((it) => it.show)"
							:key="item.route"
							:to="item.route"
							@click="isOpen = false"
							:class="
								cn(
									'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors no-underline',
									isActive(item.route)
										? 'bg-primary/10 text-primary'
										: 'text-muted-foreground hover:bg-muted hover:text-foreground',
								)
							"
						>
							<component :is="item.icon" class="w-4 h-4 shrink-0" />
							<span>{{ item.label }}</span>
						</router-link>
					</nav>
				</ScrollArea>

				<div class="p-3 border-t border-border">
					<div class="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
						<Building2 class="w-3.5 h-3.5" />
						<span class="truncate">{{ posStore.warehouse }}</span>
					</div>
				</div>
			</aside>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import { ref, inject, type Ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { cn } from "@/lib/utils";
import { __ } from "@/lib/translate";
import { hasPermission } from "@/services/userRights";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	LayoutGrid,
	FileText,
	ShoppingBag,
	ClipboardList,
	PackageCheck,
	Printer,
	ChevronLeft,
	ChevronRight,
	Building2,
	Receipt,
	Settings,
	Wallet,
	Landmark,
} from "lucide-vue-next";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";
import { isElectron } from "@/services/electronBridge";

const route = useRoute();
const posStore = usePosStore();
const isDark = inject<Ref<boolean>>("isDark")!;

const isOpen = ref(false);

function handleToggleSidebar() {
	isOpen.value = !isOpen.value;
}

onMounted(() => {
	window.addEventListener("xpos:toggle-sidebar", handleToggleSidebar);
});

onUnmounted(() => {
	window.removeEventListener("xpos:toggle-sidebar", handleToggleSidebar);
});

const isRtl = computed(() => document.documentElement.dir === "rtl");
const toggleIcon = computed(() => {
	if (isOpen.value) return isRtl.value ? ChevronRight : ChevronLeft;
	return isRtl.value ? ChevronLeft : ChevronRight;
});

const mainNavItems = [
	{ route: "/pos", label: __("POS"), icon: LayoutGrid },
	{ route: "/orders", label: __("Orders"), icon: FileText },
];

const purchaseNavItems = [
	{ route: "/purchase-order", label: __("Purchase Order"), icon: ClipboardList },
	{ route: "/purchase-invoice", label: __("Purchase Invoice"), icon: Receipt },
	{ route: "/stock-receiving", label: __("Stock Receiving"), icon: PackageCheck },
];

const toolsNavItems = [
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

function isActive(path: string): boolean {
	return route.path === path;
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
	transform: translateX(-100%);
}

[dir="rtl"] .slide-enter-from,
[dir="rtl"] .slide-leave-to {
	transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
