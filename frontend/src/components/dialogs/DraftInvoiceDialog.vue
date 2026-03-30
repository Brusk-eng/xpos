<template>
	<Dialog
		:open="cartStore.showDraftDialog"
		@update:open="
			(val: boolean) => {
				if (!val) close();
			}
		"
	>
		<DialogContent class="max-w-3xl max-h-[75vh] flex flex-col p-0 gap-0">
			<DialogHeader class="shrink-0 px-5 pt-5 pb-3 border-b border-border">
				<div class="flex items-center gap-2">
					<div
						class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center"
					>
						<Clock class="w-4 h-4" />
					</div>
					<div>
						<DialogTitle class="text-base">
							{{ __("Restore Draft Invoice") }}
						</DialogTitle>
						<DialogDescription class="text-xs">
							{{ __("Select a draft invoice to restore to cart") }}
						</DialogDescription>
					</div>
				</div>
			</DialogHeader>

			<div class="flex-1 overflow-y-auto p-5 space-y-4 xpos-scrollbar">
				<div v-if="isLoading" class="flex items-center justify-center py-8">
					<Loader2 class="w-6 h-6 text-primary animate-spin" />
				</div>

				<div
					v-else-if="!drafts.length"
					class="flex flex-col items-center justify-center py-12 text-muted-foreground"
				>
					<FileText class="w-12 h-12 mb-3 text-muted-foreground/40" />
					<p class="text-sm font-medium">{{ __("No draft invoices found") }}</p>
					<p class="text-xs mt-1">
						{{ __("Save your current order to create a draft") }}
					</p>
				</div>

				<div v-else class="space-y-2">
					<div
						v-for="draft in drafts"
						:key="draft.name"
						class="p-3 rounded-lg border border-border hover:border-primary/30 transition-colors cursor-pointer group"
						@click="selectDraft(draft)"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<h3 class="text-sm font-medium text-foreground truncate">
										{{ draft.name }}
									</h3>
									<Badge variant="destructive" class="text-xs">
										{{ __("Draft") }}
									</Badge>
								</div>

								<div class="flex items-center gap-4 text-xs text-muted-foreground mb-2">
									<span class="flex items-center gap-1">
										<User class="w-3 h-3" />
										{{ draft.customer_name || draft.customer || __("Walk-in Customer") }}
									</span>
									<span class="flex items-center gap-1">
										<Calendar class="w-3 h-3" />
										{{ formatDateTime(draft.creation) }}
									</span>
								</div>

								<div class="flex items-center gap-4 text-xs">
									<span class="text-muted-foreground">
										{{ plural(draft.total_qty || 0, __("item"), __("items")) }}
									</span>
									<span class="font-medium text-primary">
										{{ posStore.currencySymbol }}{{ formatPrice(draft.grand_total || 0) }}
									</span>
								</div>
							</div>

							<div class="ms-3 flex items-center gap-2">
								<TooltipWrapper :content="__('Delete draft')">
									<Button
										variant="ghost"
										size="icon-sm"
										class="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
										@click.stop="deleteDraft(draft.name)"
									>
										<Trash2 class="w-3.5 h-3.5" />
									</Button>
								</TooltipWrapper>
								<Button
									variant="ghost"
									size="icon-sm"
									class="opacity-0 group-hover:opacity-100"
									@click.stop="selectDraft(draft)"
								>
									<ArrowRight class="w-3.5 h-3.5" />
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<DialogFooter class="shrink-0 border-t border-border px-5 py-4">
				<Button variant="outline" class="flex-1" @click="close">
					{{ __("Cancel") }}
				</Button>
				<Button class="flex-1" @click="refreshDrafts" :disabled="isLoading">
					<RefreshCw class="w-4 h-4 me-2" :class="{ 'animate-spin': isLoading }" />
					{{ __("Refresh") }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useCartStore } from "@/stores/cartStore";
import { usePosStore } from "@/stores/posStore";
import { call, showSuccess, showError } from "@/services/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { Clock, FileText, Loader2, User, Calendar, ArrowRight, Trash2, RefreshCw } from "lucide-vue-next";
import { __ } from "@/lib/translate";

const cartStore = useCartStore();
const posStore = usePosStore();

const drafts = ref<any[]>([]);
const isLoading = ref(false);

const isDialogOpen = computed(() => cartStore.showDraftDialog);

watch(isDialogOpen, (open) => {
	if (open) {
		fetchDrafts();
	}
});

onMounted(() => {
	if (isDialogOpen.value) {
		fetchDrafts();
	}
});

async function fetchDrafts() {
	isLoading.value = true;
	try {
		drafts.value = await cartStore.fetchDraftInvoices();
	} catch (error) {
		console.error("Error fetching drafts:", error);
		showError(__("Failed to fetch draft invoices"));
		drafts.value = [];
	} finally {
		isLoading.value = false;
	}
}

async function refreshDrafts() {
	await fetchDrafts();
}

async function selectDraft(draft: any) {
	try {
		const success = await cartStore.loadDraftInvoice(draft.name);
		if (success) {
			showSuccess(__("Draft invoice restored to cart"));
			close();
		} else {
			showError(__("Failed to load draft invoice"));
		}
	} catch (error) {
		console.error("Error loading draft:", error);
		showError(__("Failed to load draft invoice"));
	}
}

async function deleteDraft(draftName: string) {
	if (!confirm(__("Are you sure you want to delete this draft?"))) {
		return;
	}

	try {
		await call("xpos.api.invoices.delete_draft_invoice", {
			name: draftName,
		});
		showSuccess(__("Draft invoice deleted"));
		await refreshDrafts();
	} catch (error) {
		console.error("Error deleting draft:", error);
		showError(__("Failed to delete draft invoice"));
	}
}

function close() {
	cartStore.closeDraftDialog();
}

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}

function formatDateTime(isoString: string | undefined) {
	if (!isoString) return "";
	try {
		return new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(isoString));
	} catch {
		return isoString;
	}
}

function plural(count: number, singular: string, pluralForm: string) {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}
</script>
