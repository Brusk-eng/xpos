<template>
	<header
		class="z-30 mx-3 mt-2 flex h-14 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card/70 px-2 shadow-raised backdrop-blur-sm lg:gap-2"
	>
		<!-- Keyboard-only entry to the invisible dock; pointers use the edge hover / swipe instead. -->
		<button
			type="button"
			class="sr-only rounded-lg bg-card px-3 py-2 text-sm font-semibold focus-visible:not-sr-only focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
			@click="toggleSidebar"
		>
			{{ __("Open navigation") }}
		</button>
		<router-link
			to="/pos"
			class="flex shrink-0 items-center rounded-xl no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
		>
			<XposLogo variant="full" version="v3" :size="32" class="hidden lg:inline-flex" />
			<XposLogo :size="32" class="lg:hidden" />
		</router-link>
		<nav class="ms-2 hidden items-center gap-1 md:flex lg:ms-5" :aria-label="__('Main')">
			<router-link
				v-for="link in navLinks"
				:key="link.to"
				:to="link.to"
				:aria-current="link.active ? 'page' : undefined"
				:class="
					cn(
						'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold no-underline transition-[background-color,border-color,box-shadow] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:px-3.5',
						link.active
							? 'border-primary bg-primary text-primary-foreground shadow-primary'
							: 'border-transparent text-foreground hover:bg-surface-hover',
					)
				"
			>
				<component :is="link.icon" class="size-4.5" aria-hidden="true" />
				<span>{{ link.label }}</span>
			</router-link>
		</nav>

		<div class="flex-1"></div>

		<TooltipWrapper :content="__('Repeat invoice')" shortcut="Ctrl+G">
			<Button
				variant="outline"
				class="h-10 gap-2 rounded-lg px-2.5 xl:px-3.5"
				:aria-label="__('Repeat invoice')"
				@click="showRepeatDialog = true"
			>
				<Repeat class="size-4.5!" />
				<span class="hidden xl:inline">{{ __("Repeat") }}</span>
			</Button>
		</TooltipWrapper>

		<TooltipWrapper
			v-if="posStore.allowReturn && hasPermission('sale_return')"
			:content="__('Process return')"
			shortcut="Ctrl+R"
		>
			<Button
				variant="outline"
				class="h-10 gap-2 rounded-lg px-2.5 xl:px-3.5"
				:aria-label="__('Process return')"
				@click="showReturnDialog = true"
			>
				<RotateCcw class="size-4.5!" />
				<span class="hidden xl:inline">{{ __("Return") }}</span>
			</Button>
		</TooltipWrapper>

		<ConnectionStatus />

		<Popover>
			<PopoverTrigger as-child>
				<Button variant="outline" class="hidden h-10 gap-2 rounded-lg px-3 lg:inline-flex">
					<Building2 class="size-4.5!" />
					<span class="max-w-40 truncate">{{ posStore.warehouse }}</span>
					<ChevronDown class="size-4! text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContentStyled class="w-72 p-3" align="end">
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-xs font-medium text-muted-foreground">{{ __("Warehouse") }}</dt>
						<dd class="font-semibold">{{ posStore.warehouse }}</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground">{{ __("POS Profile") }}</dt>
						<dd class="font-semibold">{{ posStore.profileName }}</dd>
					</div>
					<div>
						<dt class="text-xs font-medium text-muted-foreground">{{ __("Company") }}</dt>
						<dd class="font-semibold">{{ posStore.companyName }}</dd>
					</div>
				</dl>
			</PopoverContentStyled>
		</Popover>

		<Popover>
			<PopoverTrigger as-child>
				<Button variant="outline" size="icon" class="size-10 rounded-lg" :aria-label="__('Account')">
					<Avatar v-if="authStore.user?.image" size="sm">
						<img :src="authStore.user.image" alt="" />
					</Avatar>
					<User v-else class="size-5!" />
				</Button>
			</PopoverTrigger>
			<PopoverContentStyled class="w-72 p-2" align="end" role="menu">
				<div class="mb-2 flex items-center gap-3 rounded-xl bg-surface-sunken px-3 py-2.5">
					<span
						class="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
					>
						<User class="size-4.5" />
					</span>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">
							{{ authStore.userFullName || __("User") }}
						</p>
						<p class="truncate text-xs text-muted-foreground">{{ authStore.userEmail }}</p>
					</div>
				</div>
				<PopoverMenuItem shortcut="Ctrl+K" @click="openSearch">
					<template #icon><Search /></template>
					{{ __("Search Items") }}
				</PopoverMenuItem>
				<PopoverMenuItem
					v-if="posStore.lastInvoiceName && hasPermission('allow_reprint_invoice')"
					@click="printLastInvoice"
				>
					<template #icon><Printer /></template>
					{{ __("Print Last Invoice") }}
				</PopoverMenuItem>
				<PopoverMenuItem @click="goToDesk">
					<template #icon><LayoutDashboard /></template>
					{{ __("Go to Desk") }}
				</PopoverMenuItem>
				<div class="my-1.5 h-px bg-border" role="separator" />
				<PopoverMenuItem @click="toggleDarkMode">
					<template #icon><component :is="themeIcon" /></template>
					{{ themeTooltip.split(" (")[0] }}
				</PopoverMenuItem>
				<PopoverMenuItem @click="showShortcutsDialog = true">
					<template #icon><Keyboard /></template>
					{{ __("Keyboard Shortcuts") }}
				</PopoverMenuItem>
				<PopoverMenuItem @click="showAboutDialog = true">
					<template #icon><Info /></template>
					{{ __("About X POS") }}
				</PopoverMenuItem>
				<div class="my-1.5 h-px bg-border" role="separator" />
				<PopoverMenuItem destructive @click="handleSignOut">
					<template #icon><Power /></template>
					{{ __("Sign Out") }}
				</PopoverMenuItem>
			</PopoverContentStyled>
		</Popover>

		<TooltipWrapper v-if="!posStore.hideClosingShift" :content="__('Close Shift')">
			<Button
				variant="outline"
				class="h-10 gap-2 rounded-lg px-2.5 xl:px-3.5"
				:aria-label="__('Close Shift')"
				@click="
					posStore.showClosingDialog = true;
					posStore.fetchClosingData();
				"
			>
				<LogOut class="size-4.5!" />
				<span class="hidden xl:inline">{{ __("Close Shift") }}</span>
			</Button>
		</TooltipWrapper>

		<ReturnDialog :open="showReturnDialog" @close="showReturnDialog = false" />

		<RepeatInvoiceDialog :open="showRepeatDialog" @close="showRepeatDialog = false" />

		<AboutDialog :open="showAboutDialog" @close="showAboutDialog = false" />
		<KeyboardShortcutsDialog :open="showShortcutsDialog" @close="showShortcutsDialog = false" />
	</header>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, nextTick, type Ref } from "vue";
import { usePosStore } from "@/stores/posStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { useAuthStore } from "@/stores/authStore";
import { __ } from "@/lib/translate";
import { hasPermission } from "@/services/userRights";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { XposLogo } from "@/components/ui/brand";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverContentStyled, PopoverMenuItem, PopoverTrigger } from "@/components/ui/popover";
import ReturnDialog from "@/components/dialogs/ReturnDialog.vue";
import RepeatInvoiceDialog from "@/components/dialogs/RepeatInvoiceDialog.vue";
import {
	Building2,
	Sun,
	Moon,
	Monitor,
	User,
	LogOut,
	ArrowDownCircle,
	ArrowUpCircle,
	BarChart3,
	RotateCcw,
	Repeat,
	Printer,
	Power,
	FileText,
	Search,
	Info,
	Keyboard,
	LayoutDashboard,
	ShoppingCart,
	ChevronDown,
} from "lucide-vue-next";
import ConnectionStatus from "@/components/ConnectionStatus.vue";
import AboutDialog from "@/components/dialogs/AboutDialog.vue";
import KeyboardShortcutsDialog from "@/components/dialogs/KeyboardShortcutsDialog.vue";

import { usePrintInvoice } from "@/composables/usePrintInvoice";
import { cn } from "@/lib/utils";
import { useRoute, useRouter } from "vue-router";

const router = useRouter();
const route = useRoute();
const posStore = usePosStore();
const { openInvoicePrintView } = usePrintInvoice();
const paymentStore = usePaymentStore();
const authStore = useAuthStore();

const isDark = inject<Ref<boolean>>("isDark")!;
const theme = inject<Ref<"light" | "dark" | "system">>("theme")!;
const toggleDarkMode = inject<() => void>("toggleDarkMode")!;

const themeIcon = computed(() => {
	if (theme.value === "system") return Monitor;
	if (theme.value === "dark") return Moon;
	return Sun;
});

const themeTooltip = computed(() => {
	if (theme.value === "light") return __("Theme: Light (click to switch to Dark)");
	if (theme.value === "dark") return __("Theme: Dark (click to switch to System)");
	return __("Theme: System ({0}) (click to switch to Light)", [isDark.value ? __("Dark") : __("Light")]);
});

const navLinks = computed(() => [
	{ to: "/pos", label: __("POS"), icon: ShoppingCart, active: route.name === "pos" },
	{ to: "/orders", label: __("Orders"), icon: FileText, active: route.name === "orders" },
	{ to: "/reports", label: __("Reports"), icon: BarChart3, active: route.path.startsWith("/reports") },
]);

const showReturnDialog = ref(false);
const showRepeatDialog = ref(false);
const showAboutDialog = ref(false);
const showShortcutsDialog = ref(false);

function toggleSidebar() {
	window.dispatchEvent(new CustomEvent("xpos:toggle-sidebar"));
}

function openSearch() {
	router.push("/pos");
	nextTick(() => window.dispatchEvent(new CustomEvent("xpos:open-command-search")));
}

function handleShowRepeatDialog() {
	showRepeatDialog.value = true;
}

function handleShowReturnDialog() {
	if (!posStore.allowReturn || !hasPermission("sale_return")) return;
	showReturnDialog.value = true;
}

function handleKeyboard(e: KeyboardEvent) {
	if (e.ctrlKey && e.key.toLowerCase() === "g") {
		e.preventDefault();
		showRepeatDialog.value = true;
	}
	if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
		e.preventDefault();
		if (posStore.allowReturn && hasPermission("sale_return")) showReturnDialog.value = true;
	}
}

onMounted(() => {
	window.addEventListener("keydown", handleKeyboard);
	window.addEventListener("xpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.addEventListener("xpos:show-return-dialog", handleShowReturnDialog as EventListener);
});

onUnmounted(() => {
	window.removeEventListener("keydown", handleKeyboard);
	window.removeEventListener("xpos:show-repeat-dialog", handleShowRepeatDialog as EventListener);
	window.removeEventListener("xpos:show-return-dialog", handleShowReturnDialog as EventListener);
});

function printLastInvoice() {
	const name = posStore.lastInvoiceName;
	if (!name) return;
	void openInvoicePrintView(name);
}

function handleSignOut() {
	authStore.logout();
}

function goToDesk() {
	window.location.href = "/app";
}
</script>
