<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import { usePurchaseStore } from "@/stores/purchaseStore";
import { usePosStore } from "@/stores/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import {
	Search,
	Plus,
	FileText,
	ChevronRight,
	Calendar,
	Package,
	RefreshCw,
	Edit,
	Trash2,
	Eye,
	Clock,
	CheckCircle,
	AlertCircle,
	Send,
} from "lucide-vue-next";
import __ from "@/lib/translate";
import LinkField from "@/components/ui/link/LinkField.vue";
import type { PurchaseOrder } from "@/types/pos.types";

const router = useRouter();
const purchaseStore = usePurchaseStore();
const posStore = usePosStore();

const searchTerm = ref("");
const supplierFilter = ref("");
const statusFilter = ref("");
const fromDate = ref("");
const toDate = ref("");
const selectedOrder = ref<PurchaseOrder | null>(null);
const showDetailDialog = ref(false);
const isLoadingDetail = ref(false);

const draftOrders = ref<
	Array<{
		name: string;
		supplier: string;
		supplier_name: string;
		transaction_date: string;
		creation: string;
		modified: string;
		items_count: number;
	}>
>([]);

const statusOptions = [
	{ value: "", label: __("All Status") },
	{ value: "Draft", label: __("Draft") },
	{ value: "To Receive and Bill", label: __("To Receive and Bill") },
	{ value: "To Bill", label: __("To Bill") },
	{ value: "To Receive", label: __("To Receive") },
	{ value: "Completed", label: __("Completed") },
	{ value: "Cancelled", label: __("Cancelled") },
];

const filteredOrders = computed(() => {
	let orders = purchaseStore.purchaseOrders;

	if (searchTerm.value) {
		const search = searchTerm.value.toLowerCase();
		orders = orders.filter(
			(o) => o.name.toLowerCase().includes(search) || o.supplier_name?.toLowerCase().includes(search),
		);
	}

	return orders;
});

function formatCurrency(value: number): string {
	return `${posStore.currencySymbol}${(value || 0).toFixed(2)}`;
}

function formatDate(date: string): string {
	if (!date) return "-";
	return new Date(date).toLocaleDateString();
}

function statusVariant(
	status: string,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
	switch (status) {
		case "Completed":
			return "success";
		case "Draft":
			return "secondary";
		case "To Receive and Bill":
		case "To Receive":
		case "To Bill":
			return "warning";
		case "Cancelled":
			return "destructive";
		default:
			return "outline";
	}
}

function statusIcon(status: string) {
	switch (status) {
		case "Completed":
			return CheckCircle;
		case "Draft":
			return Edit;
		case "To Receive and Bill":
		case "To Receive":
		case "To Bill":
			return Clock;
		case "Cancelled":
			return AlertCircle;
		default:
			return FileText;
	}
}

async function fetchOrders(): Promise<void> {
	await purchaseStore.fetchPurchaseOrders({
		status: statusFilter.value || undefined,
		supplier: supplierFilter.value || undefined,
		from_date: fromDate.value || undefined,
		to_date: toDate.value || undefined,
	});
}

async function viewOrder(order: PurchaseOrder): Promise<void> {
	showDetailDialog.value = true;
	isLoadingDetail.value = true;
	try {
		const detail = await purchaseStore.fetchReceiptDetail(order.name);
		selectedOrder.value = { ...order, items: detail?.items || [] };
	} catch {
		selectedOrder.value = order;
	} finally {
		isLoadingDetail.value = false;
	}
}

function createNewOrder(): void {
	purchaseStore.clearCart();
	purchaseStore.clearSupplier();
	purchaseStore.currentDraftName = null;
	router.push("/purchase-order");
}

async function editDraftOrder(draft: { name: string }): Promise<void> {
	await purchaseStore.loadDraft(draft.name);
	router.push("/purchase-order");
}

async function deleteDraftOrder(name: string): Promise<void> {
	await purchaseStore.deleteDraft(name);
	await loadDrafts();
}

async function loadDrafts(): Promise<void> {
	draftOrders.value = await purchaseStore.getAllDrafts();
}

function editSubmittedOrder(order: PurchaseOrder): void {
	purchaseStore.loadFromOrder(order);
	router.push("/purchase-order");
}

onMounted(() => {
	purchaseStore.init();
	fetchOrders();
	loadDrafts();
});
</script>

<template>
	<div class="h-full flex flex-col bg-background overflow-hidden">
		<header class="bg-card border-b border-border px-4 py-3 shrink-0">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<FileText class="w-6 h-6 text-primary" />
					<h1 class="text-xl font-semibold text-foreground">
						{{ __("Purchase Orders") }}
					</h1>
				</div>
				<div class="flex items-center gap-2">
					<Button @click="fetchOrders" variant="outline" size="sm">
						<RefreshCw class="w-4 h-4 me-1" />
						{{ __("Refresh") }}
					</Button>
					<Button @click="createNewOrder">
						<Plus class="w-4 h-4 me-1" />
						{{ __("New Order") }}
					</Button>
				</div>
			</div>
		</header>

		<div class="bg-card border-b border-border px-4 py-3 shrink-0">
			<div class="grid grid-cols-5 gap-3">
				<div class="relative">
					<Search
						class="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
					/>
					<Input
						v-model="searchTerm"
						:placeholder="__('Search orders...')"
						class="ps-8 h-8 text-sm"
					/>
				</div>
				<LinkField
					v-model="supplierFilter"
					doctype="Supplier"
					class="h-8 text-sm"
					@update:model-value="fetchOrders"
				/>
				<select
					v-model="statusFilter"
					@change="fetchOrders()"
					class="w-full h-8 px-2 border border-border rounded-md text-sm bg-background text-foreground"
				>
					<option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
						{{ opt.label }}
					</option>
				</select>
				<Input v-model="fromDate" type="date" class="h-8 text-sm" @change="fetchOrders" />
				<Input v-model="toDate" type="date" class="h-8 text-sm" @change="fetchOrders" />
			</div>
		</div>

		<div class="flex-1 flex min-h-0 overflow-hidden">
			<div
				v-if="draftOrders.length > 0"
				class="w-72 border-e border-border bg-card flex flex-col shrink-0"
			>
				<div class="px-3 py-2 border-b border-border bg-muted">
					<span class="text-sm font-medium text-foreground">
						{{ __("Drafts") }} ({{ draftOrders.length }})
					</span>
				</div>
				<ScrollArea class="flex-1 min-h-0">
					<div class="divide-y divide-border">
						<div
							v-for="draft in draftOrders"
							:key="draft.name"
							class="p-3 hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-center justify-between mb-1">
								<span class="text-sm font-medium text-foreground truncate">
									{{ draft.supplier_name || draft.supplier || __("No Supplier") }}
								</span>
								<Badge variant="secondary" class="text-[10px]">{{ __("Draft") }}</Badge>
							</div>
							<div class="text-xs text-muted-foreground mb-2">
								{{ formatDate(draft.modified) }} · {{ draft.items_count || 0 }}
								{{ __("items") }}
							</div>
							<div class="flex gap-1">
								<Button
									@click="editDraftOrder(draft)"
									variant="outline"
									size="sm"
									class="flex-1 h-7"
								>
									<Edit class="w-3 h-3 me-1" />
									{{ __("Edit") }}
								</Button>
								<Button
									@click="deleteDraftOrder(draft.name)"
									variant="ghost"
									size="icon"
									class="h-7 w-7 text-destructive hover:text-destructive"
								>
									<Trash2 class="w-3 h-3" />
								</Button>
							</div>
						</div>
					</div>
				</ScrollArea>
			</div>

			<div class="flex-1 flex flex-col min-h-0 overflow-hidden">
				<ScrollArea class="flex-1 min-h-0 p-4">
					<div v-if="purchaseStore.isLoadingOrders" class="grid gap-3">
						<div v-for="i in 5" :key="i" class="skeleton h-20 w-full rounded-xl"></div>
					</div>
					<div
						v-else-if="filteredOrders.length === 0"
						class="flex flex-col items-center justify-center h-64 text-muted-foreground"
					>
						<Package class="w-16 h-16 mb-4 text-muted-foreground/30" />
						<p class="text-lg font-medium">{{ __("No purchase orders found") }}</p>
						<p class="text-sm">
							{{ __("Create a new order or adjust your filters") }}
						</p>
					</div>

					<div v-else class="space-y-2">
						<Card
							v-for="order in filteredOrders"
							:key="order.name"
							class="p-4 cursor-pointer transition-all duration-200 border-transparent hover:border-primary/40 hover:shadow-md"
							@click="viewOrder(order)"
						>
							<div class="flex items-center gap-4">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 mb-1">
										<span class="font-semibold text-foreground">{{ order.name }}</span>
										<Badge :variant="statusVariant(order.status)" class="text-[10px]">
											{{ __(order.status) }}
										</Badge>
									</div>
									<div class="flex items-center gap-3 text-xs text-muted-foreground">
										<span class="flex items-center gap-1">
											<Package class="h-3 w-3" />
											{{ order.supplier_name || order.supplier }}
										</span>
										<span class="flex items-center gap-1">
											<Calendar class="h-3 w-3" />
											{{ formatDate(order.transaction_date) }}
										</span>
									</div>
								</div>

								<div class="text-end shrink-0">
									<div class="font-bold text-foreground text-lg">
										{{ formatCurrency(order.grand_total) }}
									</div>
									<div
										class="flex items-center gap-2 justify-end text-xs text-muted-foreground"
									>
										<span>{{ __("Received") }}: {{ order.per_received || 0 }}%</span>
										<span>{{ __("Billed") }}: {{ order.per_billed || 0 }}%</span>
									</div>
								</div>
								<ChevronRight class="w-5 h-5 text-muted-foreground/40 shrink-0" />
							</div>
						</Card>
					</div>
				</ScrollArea>
			</div>
		</div>

		<Dialog v-model:open="showDetailDialog">
			<DialogContent class="max-w-2xl p-0">
				<DialogHeader class="p-6 pb-4 border-b border-border">
					<div class="flex items-center justify-between">
						<div>
							<DialogTitle class="text-lg">
								{{ selectedOrder?.name }}
								<Badge
									v-if="selectedOrder"
									:variant="statusVariant(selectedOrder.status)"
									class="text-xs ms-2"
								>
									{{ selectedOrder.status }}
								</Badge>
							</DialogTitle>
							<DialogDescription>{{ __("Purchase Order Details") }}</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div v-if="selectedOrder" class="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Supplier")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.supplier_name || selectedOrder.supplier }}
							</p>
						</div>
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Date")
							}}</span>
							<p class="font-medium text-foreground">
								{{ formatDate(selectedOrder.transaction_date) }}
							</p>
						</div>
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Company")
							}}</span>
							<p class="font-medium text-foreground">{{ selectedOrder.company }}</p>
						</div>
					</div>

					<div v-if="isLoadingDetail" class="py-8 text-center text-muted-foreground">
						{{ __("Loading items...") }}
					</div>
					<div v-else-if="selectedOrder.items" class="space-y-2">
						<h3 class="text-sm font-semibold text-foreground">
							{{ __("Items") }} ({{ selectedOrder.items.length }})
						</h3>
						<div class="rounded-lg border border-border overflow-hidden">
							<div class="overflow-x-auto">
								<table class="w-full text-sm min-w-[360px]">
									<thead class="bg-muted/50">
										<tr>
											<th
												class="text-start px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase"
											>
												{{ __("Item") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase"
											>
												{{ __("Qty") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase"
											>
												{{ __("Rate") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase"
											>
												{{ __("Amount") }}
											</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-border">
										<tr
											v-for="item in selectedOrder.items"
											:key="item.item_code"
											class="hover:bg-muted/30 transition-colors"
										>
											<td class="px-4 py-3">
												<div class="text-foreground font-medium">
													{{ item.item_name }}
												</div>
												<div class="text-xs text-muted-foreground">
													{{ item.item_code }}
												</div>
											</td>
											<td class="px-4 py-3 text-end text-muted-foreground">
												{{ item.qty }} {{ item.uom }}
											</td>
											<td class="px-4 py-3 text-end text-muted-foreground">
												{{ formatCurrency(item.rate) }}
											</td>
											<td class="px-4 py-3 text-end font-medium text-foreground">
												{{ formatCurrency((item.qty || 0) * (item.rate || 0)) }}
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>

						<div class="space-y-2">
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">{{ __("Grand Total") }}</span>
								<span class="font-bold text-foreground text-lg">{{
									formatCurrency(selectedOrder.grand_total)
								}}</span>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter class="p-4 border-t border-border">
					<Button
						v-if="selectedOrder?.docstatus === 0"
						@click="editSubmittedOrder(selectedOrder)"
						variant="outline"
					>
						<Edit class="w-4 h-4 me-1" />
						{{ __("Edit") }}
					</Button>
					<Button @click="showDetailDialog = false">{{ __("Close") }}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>
