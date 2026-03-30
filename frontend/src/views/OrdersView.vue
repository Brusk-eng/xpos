<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-3 sm:p-4 pb-2 sm:pb-3">
			<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Order History") }}</h1>
				<div class="flex items-center gap-2 w-full sm:w-auto">
					<Input
						v-model="invoiceSearch"
						:placeholder="__('Search Invoice ID...')"
						class="flex-1 sm:w-48 h-8 text-sm"
						@keydown.enter="onInvoiceSearch"
						@input="onInvoiceSearchDebounced"
					/>
					<Autocomplete
						v-model="customerFilter"
						:options="customerFilterOptions"
						placeholder="Filter by customer..."
						:show-search-icon="true"
						:clearable="true"
						:max-visible="6"
						empty-text="No customers found"
						class="flex-1 sm:w-56"
						@search="onCustomerSearch"
						@update:model-value="onCustomerFilterChange"
					/>
				</div>
			</div>

			<ListFilters
				:from-date="fromDate"
				:to-date="toDate"
				@update="handleFilterUpdate"
				@refresh="refreshOrders"
			/>
		</div>

		<div class="flex-1 overflow-y-auto px-3 sm:px-4 xpos-scrollbar">
			<div v-if="isLoading && orders.length === 0" class="grid gap-3">
				<div v-for="i in 5" :key="i" class="skeleton h-20 w-full rounded-xl"></div>
			</div>
			<div
				v-else-if="orders.length === 0"
				class="flex flex-col items-center justify-center h-64 text-muted-foreground"
			>
				<FileText class="w-16 h-16 mb-4 text-muted-foreground/30" />
				<p class="text-lg font-medium">{{ __("No orders found") }}</p>
				<p class="text-sm">{{ __("Try adjusting your filters") }}</p>
			</div>

			<div v-else class="space-y-2" :class="{ 'opacity-50': isLoading }">
				<Card
					v-for="order in orders"
					:key="order.name"
					class="p-3 sm:p-4 cursor-pointer transition-all duration-200 border-transparent hover:border-primary/40 hover:shadow-md dark:hover:bg-accent/50 dark:hover:shadow-primary/5"
					@click="viewOrder(order)"
				>
					<div class="flex items-center gap-2 sm:gap-4">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1 flex-wrap">
								<span class="font-semibold text-foreground text-sm leading-tight">{{
									order.name
								}}</span>
								<Badge :variant="statusVariant(order.status)" class="text-[10px]"
									>{{ __(order.status) }}
								</Badge>
							</div>
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
							>
								<span
									class="flex items-center gap-1 min-w-0 truncate max-w-[120px] sm:max-w-none"
								>
									<User class="h-3 w-3 shrink-0" />
									{{ order.customer_name }}
								</span>
								<span class="flex items-center gap-1 whitespace-nowrap">
									<CalendarIcon class="h-3 w-3 shrink-0" />
									{{ formatDate(order.posting_date) }}
								</span>
								<span
									v-if="order.posting_time"
									class="flex items-center gap-1 whitespace-nowrap"
								>
									<Clock class="h-3 w-3 shrink-0" />
									{{ formatTime(String(order.posting_time)) }}
								</span>
							</div>
						</div>

						<div class="text-end shrink-0">
							<div class="font-bold text-foreground text-base sm:text-lg leading-tight">
								{{ posStore.currencySymbol }}{{ formatNumber(order.grand_total) }}
							</div>
							<div class="flex flex-col items-end gap-0 text-xs">
								<span class="text-muted-foreground whitespace-nowrap">
									Paid: {{ posStore.currencySymbol }}{{ formatNumber(order.paid_amount) }}
								</span>
								<span
									v-if="order.total_taxes_and_charges"
									class="text-muted-foreground hidden sm:inline whitespace-nowrap"
								>
									Tax: {{ posStore.currencySymbol
									}}{{ formatNumber(Number(order.total_taxes_and_charges) || 0) }}
								</span>
							</div>
						</div>
						<ChevronRight class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/40 shrink-0" />
					</div>
				</Card>
			</div>
		</div>

		<Pagination
			v-if="totalOrders > 0"
			:total="totalOrders"
			:page-size="pageSize"
			:current-page="currentPage"
			@update:current-page="handlePageChange"
			@update:page-size="handlePageSizeChange"
		/>

		<Dialog
			:open="!!selectedOrder"
			@update:open="
				(val: boolean) => {
					if (!val) selectedOrder = null;
				}
			"
		>
			<DialogScrollContent class="max-w-2xl p-0">
				<DialogHeader class="p-6 pb-4 border-b border-border">
					<div class="flex items-center justify-between">
						<div>
							<DialogTitle class="text-lg">
								{{ selectedOrder?.name }}
								<Badge
									v-if="selectedOrder"
									:variant="statusVariant(selectedOrder.status)"
									class="text-xs"
								>
									{{ selectedOrder.status }}
								</Badge>
							</DialogTitle>
							<DialogDescription>{{ __("Invoice details") }}</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div v-if="selectedOrder" class="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
					<div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Customer")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.customer_name }}
							</p>
						</div>
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Date & Time")
							}}</span>
							<DateTimePicker
								:model-value="orderDateTime(selectedOrder)"
								mode="datetime"
								:disabled="true"
								:clearable="false"
								placeholder="Posting date"
								class="w-full"
							/>
						</div>
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("POS Profile")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.pos_profile || "-" }}
							</p>
						</div>
						<div class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Created By")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.owner || "-" }}
							</p>
						</div>
						<div v-if="selectedOrder.sales_partner" class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Sales Partner")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.sales_partner }}
							</p>
						</div>
						<div v-if="selectedOrder.coupon_code" class="space-y-1">
							<span class="text-xs text-muted-foreground uppercase tracking-wide">{{
								__("Coupon")
							}}</span>
							<p class="font-medium text-foreground">
								{{ selectedOrder.coupon_code }}
							</p>
						</div>
					</div>

					<div v-if="selectedOrder.items" class="space-y-2">
						<h3 class="text-sm font-semibold text-foreground">
							{{ __("Items") }} ({{ selectedOrder.items.length }})
						</h3>
						<div class="rounded-lg border border-border overflow-hidden">
							<div class="overflow-x-auto">
								<table class="w-full text-sm min-w-[360px]">
									<thead class="bg-muted/50">
										<tr>
											<th
												class="text-start px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wide"
											>
												{{ __("Item") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wide"
											>
												{{ __("Qty") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wide"
											>
												{{ __("Rate") }}
											</th>
											<th
												class="text-end px-4 py-2.5 text-muted-foreground font-medium text-xs uppercase tracking-wide"
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
												<div
													v-if="item.discount_percentage || item.discount_amount"
													class="text-xs text-muted-foreground"
												>
													{{ __("Discount") }}:
													{{
														item.discount_percentage
															? item.discount_percentage + "%"
															: posStore.currencySymbol +
																formatNumber(item.discount_amount || 0)
													}}
												</div>
											</td>
											<td class="px-4 py-3 text-end text-muted-foreground">
												{{ item.qty }} {{ item.uom }}
											</td>
											<td class="px-4 py-3 text-end text-muted-foreground">
												{{ formatNumber(item.rate) }}
											</td>
											<td class="px-4 py-3 text-end font-medium text-foreground">
												{{ formatNumber(item.amount ?? 0) }}
											</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>

					<div class="space-y-2">
						<h3 class="text-sm font-semibold text-foreground">{{ __("Summary") }}</h3>
						<div class="rounded-lg border border-border p-4 space-y-2">
							<div class="flex justify-between text-sm">
								<span class="text-muted-foreground">{{ __("Net Total") }}</span>
								<span class="text-foreground"
									>{{ posStore.currencySymbol
									}}{{ formatNumber(selectedOrder.net_total) }}</span
								>
							</div>
							<div
								v-if="selectedOrder.total_taxes_and_charges"
								class="flex justify-between text-sm"
							>
								<span class="text-muted-foreground">{{ __("Taxes & Charges") }}</span>
								<span class="text-foreground"
									>{{ posStore.currencySymbol
									}}{{
										formatNumber(Number(selectedOrder.total_taxes_and_charges) || 0)
									}}</span
								>
							</div>
							<div
								v-if="
									selectedOrder.discount_amount ||
									selectedOrder.additional_discount_percentage
								"
								class="flex justify-between text-sm"
							>
								<span class="text-muted-foreground">
									{{ __("Discount") }}
									<span v-if="selectedOrder.additional_discount_percentage"
										>({{ selectedOrder.additional_discount_percentage }}%)</span
									>
								</span>
								<span class="text-destructive"
									>-{{ posStore.currencySymbol
									}}{{ formatNumber(Number(selectedOrder.discount_amount) || 0) }}</span
								>
							</div>
							<div v-if="selectedOrder.loyalty_amount" class="flex justify-between text-sm">
								<span class="text-muted-foreground">{{ __("Loyalty Points Redeemed") }}</span>
								<span class="text-destructive"
									>-{{ posStore.currencySymbol
									}}{{ formatNumber(selectedOrder.loyalty_amount) }}</span
								>
							</div>
							<div class="flex justify-between text-base font-bold pt-2 border-t border-border">
								<span class="text-foreground">{{ __("Grand Total") }}</span>
								<span class="text-foreground"
									>{{ posStore.currencySymbol
									}}{{ formatNumber(selectedOrder.grand_total) }}</span
								>
							</div>
						</div>
					</div>

					<div
						v-if="
							selectedOrder.taxes &&
							Array.isArray(selectedOrder.taxes) &&
							selectedOrder.taxes.length > 0
						"
						class="space-y-2"
					>
						<h3 class="text-sm font-semibold text-foreground">
							{{ __("Taxes Breakdown") }}
						</h3>
						<div class="rounded-lg border border-border divide-y divide-border">
							<div
								v-for="tax in selectedOrder.taxes as any[]"
								:key="tax.description"
								class="flex justify-between px-4 py-2.5 text-sm"
							>
								<span class="text-muted-foreground"
									>{{ tax.description }} ({{ tax.rate }}%)</span
								>
								<span class="text-foreground font-medium"
									>{{ posStore.currencySymbol }}{{ formatNumber(tax.tax_amount) }}</span
								>
							</div>
						</div>
					</div>

					<div v-if="selectedOrder.payments && selectedOrder.payments.length > 0" class="space-y-2">
						<h3 class="text-sm font-semibold text-foreground">{{ __("Payments") }}</h3>
						<div class="rounded-lg border border-border divide-y divide-border">
							<div
								v-for="p in selectedOrder.payments"
								:key="p.mode_of_payment"
								class="flex justify-between items-center px-4 py-2.5"
							>
								<span class="text-muted-foreground text-sm">{{ p.mode_of_payment }}</span>
								<span class="font-medium text-foreground"
									>{{ posStore.currencySymbol }}{{ formatNumber(p.amount) }}</span
								>
							</div>
							<div
								v-if="selectedOrder.change_amount"
								class="flex justify-between items-center px-4 py-2.5 bg-muted/30"
							>
								<span class="text-muted-foreground text-sm">{{ __("Change Given") }}</span>
								<span class="font-medium text-foreground"
									>{{ posStore.currencySymbol
									}}{{ formatNumber(Number(selectedOrder.change_amount) || 0) }}</span
								>
							</div>
						</div>
					</div>

					<div
						v-if="selectedOrder.loyalty_program || selectedOrder.loyalty_points"
						class="space-y-2"
					>
						<h3 class="text-sm font-semibold text-foreground">
							{{ __("Loyalty Information") }}
						</h3>
						<div class="rounded-lg border border-border p-4 space-y-2">
							<div v-if="selectedOrder.loyalty_program" class="flex justify-between text-sm">
								<span class="text-muted-foreground">{{ __("Program") }}</span>
								<span class="text-foreground">{{ selectedOrder.loyalty_program }}</span>
							</div>
							<div v-if="selectedOrder.loyalty_points" class="flex justify-between text-sm">
								<span class="text-muted-foreground">{{ __("Points Earned") }}</span>
								<span class="text-foreground font-medium">{{
									selectedOrder.loyalty_points
								}}</span>
							</div>
							<div
								v-if="selectedOrder.redeem_loyalty_points"
								class="flex justify-between text-sm"
							>
								<span class="text-muted-foreground">{{ __("Points Redeemed") }}</span>
								<span class="text-foreground">{{ selectedOrder.redeem_loyalty_points }}</span>
							</div>
						</div>
					</div>

					<div v-if="selectedOrder.remarks" class="space-y-2">
						<h3 class="text-sm font-semibold text-foreground">{{ __("Remarks") }}</h3>
						<div class="rounded-lg border border-border p-4 text-sm text-muted-foreground">
							{{ selectedOrder.remarks }}
						</div>
					</div>
				</div>

				<DialogFooter class="p-6 pt-4 border-t border-border gap-2 sm:gap-2">
					<Button variant="outline" size="sm" @click="printInvoice(selectedOrder!.name)">
						<Printer class="w-4 h-4" />
						{{ __("Print") }}
					</Button>
					<Button
						v-if="
							selectedOrder && !selectedOrder.is_return && selectedOrder.status !== 'Cancelled'
						"
						variant="outline"
						size="sm"
						class="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
						@click="returnFromOrder(selectedOrder!)"
					>
						<RotateCcw class="w-4 h-4" />
						{{ __("Return") }}
					</Button>
					<div class="flex-1"></div>
					<Button size="sm" @click="selectedOrder = null">{{ __("Close") }}</Button>
				</DialogFooter>
			</DialogScrollContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { call } from "@/services/api";
import type { Invoice } from "@/types/pos.types";
import {
	Dialog,
	DialogScrollContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Autocomplete } from "@/components/ui/autocomplete";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import {
	FileText,
	ChevronRight,
	Printer,
	RotateCcw,
	User,
	Calendar as CalendarIcon,
	Clock,
} from "lucide-vue-next";
import ListFilters from "@/components/orders/ListFilters.vue";
import Pagination from "@/components/orders/Pagination.vue";
import __ from "@/lib/translate";
import { get_full_url } from "@/utils";

const posStore = usePosStore();
const cartStore = useCartStore();
const router = useRouter();

const orders = ref<Invoice[]>([]);
const isLoading = ref(false);
const fromDate = ref("");
const toDate = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const totalOrders = ref(0);
const selectedOrder = ref<Invoice | null>(null);

const customerFilter = ref("");
const customerFilterOptions = ref<AutocompleteOption[]>([]);
const invoiceSearch = ref("");
let invoiceSearchTimer: ReturnType<typeof setTimeout> | null = null;

function onCustomerSearch(query: string) {
	if (!query || query.length < 2) {
		customerFilterOptions.value = [];
		return;
	}
	const seen = new Set<string>();
	const opts: AutocompleteOption[] = [];
	for (const order of orders.value) {
		const name = order.customer_name || order.customer || "";
		if (name && !seen.has(name) && name.toLowerCase().includes(query.toLowerCase())) {
			seen.add(name);
			opts.push({ label: name, value: name });
		}
	}
	customerFilterOptions.value = opts;
}

function onCustomerFilterChange(val: string) {
	customerFilter.value = val;
	if (val) {
		activeFilters.value.queryFilters = [
			...activeFilters.value.queryFilters.filter((f) => f[0] !== "customer_name"),
			["customer_name", "like", `%${val}%`],
		];
	} else {
		activeFilters.value.queryFilters = activeFilters.value.queryFilters.filter(
			(f) => f[0] !== "customer_name",
		);
	}
	currentPage.value = 1;
	fetchOrders();
}

function onInvoiceSearch() {
	const val = invoiceSearch.value.trim();
	if (val) {
		activeFilters.value.queryFilters = [
			...activeFilters.value.queryFilters.filter((f) => f[0] !== "name"),
			["name", "like", `%${val}%`],
		];
	} else {
		activeFilters.value.queryFilters = activeFilters.value.queryFilters.filter((f) => f[0] !== "name");
	}
	currentPage.value = 1;
	fetchOrders();
}

function onInvoiceSearchDebounced() {
	if (invoiceSearchTimer) clearTimeout(invoiceSearchTimer);
	invoiceSearchTimer = setTimeout(() => onInvoiceSearch(), 400);
}

function orderDateTime(order: Invoice): string {
	const date = order.posting_date || "";
	const time = order.posting_time ? String(order.posting_time) : "00:00:00";
	if (!date) return "";
	return `${date} ${time}`;
}

const activeFilters = ref<{
	status: string;
	isReturn: string;
	orderBy: string;
	queryFilters: [string, string, string][];
}>({
	status: "__all__",
	isReturn: "__all__",
	orderBy: "posting_date desc, posting_time desc",
	queryFilters: [],
});

onMounted(() => {
	const today = new Date().toISOString().split("T")[0];
	fromDate.value = today;
	toDate.value = today;
	fetchOrders();
});

function handleFilterUpdate(filters: {
	fromDate: string;
	toDate: string;
	status: string;
	isReturn: string;
	orderBy: string;
	queryFilters: [string, string, string][];
}) {
	fromDate.value = filters.fromDate;
	toDate.value = filters.toDate;
	activeFilters.value = {
		status: filters.status,
		isReturn: filters.isReturn,
		orderBy: filters.orderBy,
		queryFilters: filters.queryFilters,
	};
	currentPage.value = 1;
	fetchOrders();
}

function handlePageChange(page: number) {
	currentPage.value = page;
	fetchOrders();
}

function handlePageSizeChange(size: number) {
	pageSize.value = size;
	currentPage.value = 1;
	fetchOrders();
}

function refreshOrders() {
	currentPage.value = 1;
	fetchOrders();
}

async function fetchOrders() {
	isLoading.value = true;
	try {
		const result = await call<{ data: Invoice[]; total: number }>("xpos.api.invoices.get_past_orders", {
			pos_profile: posStore.profileName,
			from_date: fromDate.value,
			to_date: toDate.value,
			page: currentPage.value - 1,
			limit: pageSize.value,
			filters: JSON.stringify(activeFilters.value.queryFilters),
			order_by: activeFilters.value.orderBy,
		});

		if (result && typeof result === "object" && "data" in result) {
			orders.value = result.data || [];
			totalOrders.value = result.total || 0;
		} else {
			orders.value = (result as unknown as Invoice[]) || [];
			totalOrders.value = orders.value.length;
		}
	} catch (error) {
		console.error("Error fetching orders:", error);
		orders.value = [];
		totalOrders.value = 0;
	} finally {
		isLoading.value = false;
	}
}

async function viewOrder(order: Invoice) {
	try {
		const details = await call<Invoice>("xpos.api.invoices.get_invoice_details", {
			invoice_name: order.name,
		});
		selectedOrder.value = details;
	} catch (error) {
		console.error("Error fetching order details:", error);
	}
}

function printInvoice(name: string) {
	const url = `/printview?doctype=${posStore.invoiceType}&name=${name}&format=${posStore.defaultPrintFormat}&no_letterhead=0&trigger_print=1`;
	window.open(get_full_url(url), "_blank");
}

async function returnFromOrder(order: Invoice) {
	selectedOrder.value = null;

	try {
		const details = await call<{
			items: Array<{
				item_code: string;
				item_name: string;
				rate: number;
				qty: number;
				uom: string;
				stock_uom: string;
				serial_no?: string;
				batch_no?: string;
				remaining_returnable_qty?: number;
			}>;
		}>("xpos.api.invoices.get_invoice_for_return", {
			doctype: posStore.invoiceType,
			invoice_name: order.name,
		});

		cartStore.clearCart();
		const allowedItemCodes = (details?.items || []).map((i) => i.item_code);
		cartStore.enterReturnMode(order.name, allowedItemCodes);
		cartStore.setCustomer({
			name: order.customer || order.customer_name || "",
			customer_name: order.customer_name,
		});

		if (details?.items) {
			for (const item of details.items) {
				const returnQty = item.remaining_returnable_qty ?? item.qty;
				if (returnQty > 0) {
					cartStore.addItemWithDetails(
						{
							item_code: item.item_code,
							item_name: item.item_name,
							rate: item.rate,
							uom: item.uom,
							stock_uom: item.stock_uom || item.uom,
						},
						returnQty,
						item.rate,
						item.uom,
						item.serial_no,
						item.batch_no,
					);
				}
			}
		}

		router.push("/pos");
	} catch (error) {
		console.error("Error preparing return:", error);
	}
}

function formatDate(date: string) {
	if (!date) return "";
	return new Date(date).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatTime(time: string) {
	if (!time) return "";
	const [hours, minutes] = time.split(":");
	const h = parseInt(hours);
	const ampm = h >= 12 ? "PM" : "AM";
	const hour12 = h % 12 || 12;
	return `${hour12}:${minutes} ${ampm}`;
}

function formatNumber(num: number | string) {
	return parseFloat(String(num) || "0").toFixed(2);
}

function statusVariant(
	status: string,
): "default" | "success" | "warning" | "destructive" | "secondary" | "outline" {
	const map: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
		Paid: "success",
		Unpaid: "warning",
		Overdue: "destructive",
		"Credit Note Issued": "outline",
		Cancelled: "secondary",
		Return: "warning",
	};
	return map[status] || "secondary";
}
</script>
