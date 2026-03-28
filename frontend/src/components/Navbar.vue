<template>
	<header class="h-14 bg-background border-b border-border flex items-center px-4 gap-3 shrink-0 z-30">
		<div class="flex items-center gap-2.5">
			<img :src="isDark ? LogoDark : LogoLight" alt="X POS Logo" class="w-8 h-8" />
			<span>{{ __("X POS") }}</span>
		</div>
		<nav class="flex items-center gap-1 ms-4">
			<router-link
				to="/pos"
				:class="
					cn(
						buttonVariants({
							variant: $route.name === 'pos' ? 'secondary' : 'ghost',
							size: 'sm',
						}),
						'gap-1.5 no-underline',
						$route.name === 'pos' && 'bg-primary/10 text-primary hover:bg-primary/15',
					)
				"
			>
				<LayoutGrid class="w-4 h-4" />
				<span>{{ __("POS") }}</span>
			</router-link>
			<router-link
				to="/orders"
				:class="
					cn(
						buttonVariants({
							variant: $route.name === 'orders' ? 'secondary' : 'ghost',
							size: 'sm',
						}),
						'gap-1.5 no-underline',
						$route.name === 'orders' && 'bg-primary/10 text-primary hover:bg-primary/15',
					)
				"
			>
				<FileText class="w-4 h-4" />
				<span>{{ __("Orders") }}</span>
			</router-link>
		</nav>

		<div class="flex-1"></div>

		<TooltipWrapper :content="__('Search Items (Ctrl+K)')">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-foreground gap-1"
				@click="openSearch"
			>
				<Search class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">{{ __("Search") }}</span>
			</Button>
		</TooltipWrapper>

		<TooltipWrapper :content="__('Repeat Invoice (Ctrl+G)')">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-blue-500 gap-1"
				@click="showRepeatDialog = true"
			>
				<Repeat class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">{{ __("Repeat") }}</span>
			</Button>
		</TooltipWrapper>

		<TooltipWrapper :content="__('Process Return')">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-amber-500 gap-1"
				@click="showReturnDialog = true"
			>
				<RotateCcw class="w-4 h-4" />
				<span class="hidden lg:inline text-xs">{{ __("Return") }}</span>
			</Button>
		</TooltipWrapper>

		<TooltipWrapper
			v-if="posStore.allowPrintLastInvoice && posStore.lastInvoiceName"
			:content="__('Print Last Invoice')"
		>
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-foreground gap-1"
				@click="printLastInvoice"
			>
				<Printer class="w-4 h-4" />
			</Button>
		</TooltipWrapper>

		<div v-if="posStore.useOfflineMode" class="flex items-center gap-1">
			<TooltipWrapper :content="offlineStore.statusLabel">
				<Button
					variant="ghost"
					size="sm"
					:class="['gap-1.5', offlineStore.statusColor]"
					@click="handleOfflineAction"
				>
					<Loader2 v-if="offlineStore.isSyncing" class="w-4 h-4 animate-spin" />
					<WifiOff v-else-if="!isOnline()" class="w-4 h-4" />
					<CloudUpload v-else-if="offlineStore.hasPending" class="w-4 h-4" />
					<Wifi v-else class="w-4 h-4" />
					<Badge
						v-if="offlineStore.pendingCount > 0"
						variant="destructive"
						class="h-4 min-w-4 px-1 text-[10px] leading-none"
					>
						{{ offlineStore.pendingCount }}
					</Badge>
					<span class="hidden lg:inline text-xs">{{ offlineStore.statusLabel }}</span>
				</Button>
			</TooltipWrapper>
		</div>

		<OfflinePendingPanel :open="showOfflinePanel" @close="showOfflinePanel = false" />

		<div class="hidden md:flex items-center">
			<Badge variant="secondary" class="gap-1.5">
				<Building2 class="w-3.5 h-3.5" />
				{{ posStore.warehouse }}
			</Badge>
		</div>

		<TooltipWrapper :content="themeTooltip">
			<Button
				variant="ghost"
				size="icon-sm"
				@click="toggleDarkMode"
				:class="{
					'text-amber-400': theme === 'dark',
					'text-blue-400': theme === 'system',
				}"
			>
				<component :is="themeIcon" class="w-4 h-4" />
			</Button>
		</TooltipWrapper>

		<Popover>
			<PopoverTrigger as-child>
				<Button variant="ghost" size="icon-sm" class="rounded-full">
					<Avatar size="sm">
						<AvatarFallback>
							<User class="w-3.5 h-3.5" />
						</AvatarFallback>
					</Avatar>
				</Button>
			</PopoverTrigger>
			<PopoverContentStyled class="w-56 p-2" align="end">
				<div class="px-2 py-1.5 border-b border-border mb-1">
					<p class="text-sm font-medium">{{ authStore.userFullName || __("User") }}</p>
					<p class="text-xs text-muted-foreground">{{ authStore.userEmail }}</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2"
					@click="showShortcutsDialog = true"
				>
					<Keyboard class="w-4 h-4" />
					{{ __("Keyboard Shortcuts") }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2"
					@click="showAboutDialog = true"
				>
					<Info class="w-4 h-4" />
					{{ __("About X POS") }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
					@click="handleSignOut"
				>
					<Power class="w-4 h-4" />
					{{ __("Sign Out") }}
				</Button>
			</PopoverContentStyled>
		</Popover>

		<TooltipWrapper v-if="!posStore.hideClosingShift" :content="__('Close Shift')">
			<Button
				variant="ghost"
				size="sm"
				class="text-muted-foreground hover:text-destructive gap-1.5"
				@click="
					posStore.showClosingDialog = true;
					posStore.fetchClosingData();
				"
			>
				<LogOut class="w-4 h-4" />
				<span class="hidden sm:inline">{{ __("Close Shift") }}</span>
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
import { Button, buttonVariants } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverContentStyled, PopoverTrigger } from "@/components/ui/popover";
import ReturnDialog from "@/components/cart/ReturnDialog.vue";
import RepeatInvoiceDialog from "@/components/cart/RepeatInvoiceDialog.vue";
import {
	Building2,
	Sun,
	Moon,
	Monitor,
	User,
	LogOut,
	ArrowDownCircle,
	ArrowUpCircle,
	RotateCcw,
	Repeat,
	Printer,
	Power,
	Wifi,
	WifiOff,
	CloudUpload,
	Loader2,
	LayoutGrid,
	FileText,
	Search,
	Info,
	Keyboard,
} from "lucide-vue-next";
import OfflinePendingPanel from "@/components/offline/OfflinePendingPanel.vue";
import AboutDialog from "@/components/AboutDialog.vue";
import KeyboardShortcutsDialog from "@/components/KeyboardShortcutsDialog.vue";
import { useOfflineStore } from "@/stores/offlineStore";

import LogoDark from "@/assets/images/xpos-logo-dark.svg";
import LogoLight from "@/assets/images/xpos-logo-light.svg";
import { isOnline } from "@/utils";
import { get_full_url } from "@/utils";
import { cn } from "@/lib/utils";
import { useRouter } from "vue-router";

const router = useRouter();
const posStore = usePosStore();
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
const offlineStore = useOfflineStore();

const showReturnDialog = ref(false);
const showRepeatDialog = ref(false);
const showOfflinePanel = ref(false);
const showAboutDialog = ref(false);
const showShortcutsDialog = ref(false);

function handleOfflineAction() {
	if (offlineStore.hasPending) {
		showOfflinePanel.value = true;
	} else if (!isOnline()) {
		showOfflinePanel.value = true;
	}
}

function openSearch() {
	router.push("/pos");
	nextTick(() => window.dispatchEvent(new CustomEvent("xpos:open-command-search")));
}

function handleShowRepeatDialog() {
	showRepeatDialog.value = true;
}

function handleShowReturnDialog() {
	showReturnDialog.value = true;
}

function handleKeyboard(e: KeyboardEvent) {
	if (e.ctrlKey && e.key.toLowerCase() === "g") {
		e.preventDefault();
		showRepeatDialog.value = true;
	}
	if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
		e.preventDefault();
		showReturnDialog.value = true;
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
	window.open(
		get_full_url(
			`/printview?doctype=${posStore.invoiceType}&name=${name}&format=${posStore.defaultPrintFormat}&no_letterhead=0&trigger_print=1`,
		),
		"_blank",
	);
}

function handleSignOut() {
	authStore.logout();
}
</script>
