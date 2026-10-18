<template>
	<TooltipWrapper :content="tooltip">
		<button
			type="button"
			data-testid="connection-status"
			:data-state="state"
			:aria-label="tooltip"
			:class="
				cn(
					'inline-flex shrink-0 items-center gap-2 whitespace-nowrap font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
					compact
						? 'h-6 rounded px-2 text-[12px] text-[#cccccc] hover:bg-[#505050] hover:text-white dark:hover:bg-[#2a2d2e]'
						: 'h-control rounded-lg border px-3 text-sm shadow-raised',
					!compact && toneClass,
				)
			"
			@click="handleClick"
		>
			<Loader2 v-if="state === 'syncing'" class="size-4 shrink-0 animate-spin" aria-hidden="true" />
			<span v-else class="size-2.5 shrink-0 rounded-full" :class="dotClass" aria-hidden="true" />
			<span :class="compact ? '' : 'hidden sm:inline'" aria-live="polite">{{ label }}</span>
		</button>
	</TooltipWrapper>
	<OfflinePendingPanel :open="showPanel" @close="showPanel = false" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { Loader2 } from "lucide-vue-next";
import { TooltipWrapper } from "@/components/ui/tooltip";
import OfflinePendingPanel from "@/components/offline/OfflinePendingPanel.vue";
import { useOfflineStore } from "@/stores/offlineStore";
import { cn } from "@/lib/utils";
import __ from "@/lib/translate";

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const offlineStore = useOfflineStore();
const showPanel = ref(false);

const state = computed(() => {
	if (offlineStore.isSyncing) return "syncing";
	if (!offlineStore.isOnline) return "offline";
	if (offlineStore.hasDeadLetters) return "failed";
	if (offlineStore.hasPending) return "pending";
	return "online";
});

const label = computed(() => {
	switch (state.value) {
		case "syncing":
			return __("Syncing");
		case "offline":
			return offlineStore.pendingCount > 0
				? __("Offline · {0} pending", [offlineStore.pendingCount])
				: __("Offline");
		case "failed":
			return __("Sync issue");
		case "pending":
			return __("{0} pending", [offlineStore.pendingCount]);
		default:
			return __("Online");
	}
});

const tooltip = computed(() => {
	switch (state.value) {
		case "offline":
			return __("Offline. Sales are saved on this device and sync when the connection returns.");
		case "failed":
			return __("Some records failed to sync. Click to review.");
		case "pending":
			return __("Waiting to sync. Click to review.");
		case "syncing":
			return __("Syncing offline records");
		default:
			return __("Online, everything synced");
	}
});

const dotClass = computed(() => {
	switch (state.value) {
		case "offline":
		case "failed":
			return "bg-destructive";
		case "pending":
			return "bg-warning";
		default:
			return "bg-success";
	}
});

const toneClass = computed(() => {
	switch (state.value) {
		case "offline":
		case "failed":
			return "border-destructive/30 bg-destructive-soft text-destructive-soft-foreground";
		case "pending":
			return "border-warning/30 bg-warning-soft text-warning-soft-foreground";
		default:
			return "border-border bg-surface-raised text-foreground hover:bg-surface-hover";
	}
});

function handleClick() {
	if (offlineStore.hasPending || offlineStore.hasDeadLetters || !offlineStore.isOnline) {
		showPanel.value = true;
	}
}

function handleOpenPanel() {
	showPanel.value = true;
}

onMounted(() => window.addEventListener("xpos:open-offline-panel", handleOpenPanel as EventListener));
onUnmounted(() => window.removeEventListener("xpos:open-offline-panel", handleOpenPanel as EventListener));
</script>
