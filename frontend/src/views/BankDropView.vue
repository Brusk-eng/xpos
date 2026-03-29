<template>
	<div class="flex flex-col h-full overflow-hidden bg-background">
		<div class="shrink-0 p-4 pb-3">
			<div class="flex items-center justify-between mb-4">
				<h1 class="text-xl font-bold text-foreground">{{ __("Bank Drops") }}</h1>
				<Button size="sm" @click="openForm" :disabled="!canAddBankDrop">
					<Plus class="w-4 h-4 me-1" />
					{{ __("New Bank Drop") }}
				</Button>
			</div>

			<div class="flex items-center gap-3">
				<DateTimePicker
					v-model="fromDate"
					mode="date"
					placeholder="From Date"
					:show-today="true"
					:clearable="true"
					class="w-52"
				/>
				<span class="text-muted-foreground text-sm">to</span>
				<DateTimePicker
					v-model="toDate"
					mode="date"
					placeholder="To Date"
					:show-today="true"
					:clearable="true"
					class="w-52"
				/>
				<Button variant="outline" size="sm" @click="loadDrops">
					<RefreshCw class="w-4 h-4" />
				</Button>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto px-4 xpos-scrollbar">
			<div v-if="isLoading" class="grid gap-3">
				<div v-for="i in 4" :key="i" class="skeleton h-16 w-full rounded-xl"></div>
			</div>
			<div
				v-else-if="drops.length === 0"
				class="flex flex-col items-center justify-center h-64 text-muted-foreground"
			>
				<Landmark class="w-16 h-16 mb-4 text-muted-foreground/30" />
				<p class="text-lg font-medium">{{ __("No bank drops found") }}</p>
				<p class="text-sm">{{ __("Record a cash drop to the bank") }}</p>
			</div>

			<div v-else class="space-y-2">
				<Card v-for="drop in drops" :key="drop.id" class="p-4">
					<div class="flex items-center gap-4">
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-500"
						>
							<ArrowUpCircle class="w-4 h-4" />
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span
									class="font-semibold text-foreground"
									:title="drop.remarks || drop.target_account || drop.to_account"
								>
									{{ drop.remarks || drop.target_account || drop.to_account }}
								</span>
								<Badge
									:variant="drop.docstatus === 1 ? 'default' : 'secondary'"
									class="text-[10px]"
								>
									{{ DOCSTATUS_MAP[drop.docstatus ?? 0] }}
								</Badge>
							</div>
							<div class="flex items-center gap-3 text-xs text-muted-foreground">
								<span>{{ drop.posting_date }}</span>
								<span
									v-if="
										!posStore.requireCashMovementRemarks &&
										!!drop.remarks &&
										(drop.target_account || drop.to_account)
									"
									class="truncate max-w-[400px]"
								>
									{{ drop.remarks }}
								</span>
							</div>
						</div>
						<div class="text-end">
							<span class="font-bold text-emerald-500">
								{{ posStore.currencySymbol }}{{ formatPrice(drop.amount) }}
							</span>
						</div>
						<Button
							v-if="drop.docstatus === 0 || drop.can_delete"
							variant="ghost"
							size="icon"
							class="text-destructive h-8 w-8"
							@click="handleDelete(drop.id)"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
					</div>
				</Card>
			</div>
		</div>

		<Pagination
			v-if="totalDrops > 0"
			:total="totalDrops"
			:page-size="pageSize"
			:current-page="currentPage"
			@update:current-page="handlePageChange"
			@update:page-size="handlePageSizeChange"
		/>

		<Dialog :open="showForm" @update:open="showForm = $event">
			<DialogContent class="sm:max-w-md">
				<DialogHeader>
					<div class="flex items-center gap-2">
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500"
						>
							<ArrowUpCircle class="w-4 h-4" />
						</div>
						<div>
							<DialogTitle class="text-base">{{ __("Cash Deposit") }}</DialogTitle>
							<DialogDescription class="text-xs">
								{{ __("Record a cash deposit") }}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>
				<div class="space-y-4">
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Deposit To") }}
						</label>
						<Select v-model="form.target_account">
							<SelectTriggerStyled class="h-8 w-full">
								<SelectValue :placeholder="__('Select bank account')" />
							</SelectTriggerStyled>
							<SelectContentStyled>
								<SelectItemStyled
									class="cursor-pointer"
									v-for="op in depositAccountOptions"
									:key="op.value"
									:value="op.value"
								>
									{{ op.label }}
								</SelectItemStyled>
							</SelectContentStyled>
						</Select>
					</div>
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Amount") }}
						</label>
						<NumberInput
							v-model="form.amount"
							:min="0"
							:precision="2"
							class="text-lg font-bold"
							placeholder="0.00"
						/>
					</div>
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Reason / Notes") }}
						</label>
						<textarea
							v-model="form.reason"
							rows="3"
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
							:placeholder="__('Enter reason for this transaction...')"
						/>
					</div>
				</div>
				<DialogFooter class="mt-4">
					<Button variant="outline" class="flex-1" @click="showForm = false">
						{{ __("Cancel") }}
					</Button>
					<Button
						class="flex-1 font-bold bg-emerald-500 hover:bg-emerald-600 text-white"
						:disabled="!canSubmit || isSaving"
						@click="handleSave"
					>
						<template v-if="isSaving">
							<Loader2 class="w-4 h-4 animate-spin" />
						</template>
						<template v-else>{{ __("Record Deposit") }}</template>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useAuthStore } from "@/stores/authStore";
import { usePaymentStore } from "@/stores/paymentStore";
import { hasPermission } from "@/services/userRights";
import { createBankDrop, getBankDrops, deleteBankDrop } from "@/services/dbBridge";
import { isElectron } from "@/services/electronBridge";
import { showSuccess, showError } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/ui/number-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import Select from "@/components/ui/select/Select.vue";
import { SelectTriggerStyled, SelectValue } from "@/components/ui/select";
import SelectContentStyled from "@/components/ui/select/SelectContentStyled.vue";
import SelectItemStyled from "@/components/ui/select/SelectItemStyled.vue";
import { Plus, RefreshCw, Trash2, Landmark, Loader2, ArrowUpCircle } from "lucide-vue-next";
import DateTimePicker from "@/components/ui/datetime-picker/DateTimePicker.vue";
import Pagination from "@/components/orders/Pagination.vue";
import __ from "@/lib/translate";
import { DOCSTATUS_MAP } from "@/types/pos.types";

const posStore = usePosStore();
const authStore = useAuthStore();
const paymentStore = usePaymentStore();

interface BankDrop {
	id: number | string;
	target_account?: string;
	to_account?: string;
	amount: number;
	remarks?: string;
	posting_date?: string;
	docstatus?: number;
	can_delete?: boolean;
}

const isLoading = ref(false);
const isSaving = ref(false);
const showForm = ref(false);
const drops = ref<BankDrop[]>([]);
const isElectronMode = isElectron();

const today = new Date().toISOString().slice(0, 10);
const fromDate = ref(today);
const toDate = ref(today);

const currentPage = ref(1);
const pageSize = ref(20);
const totalDrops = ref(0);
const allElectronDrops = ref<BankDrop[]>([]);

const canAddBankDrop = computed(() => hasPermission("bank_drop") && posStore.allowCashDeposit);

const form = ref({
	target_account: "",
	amount: 0,
	reason: "",
});

const depositAccountOptions = computed(() => {
	const ctx = paymentStore.cashMovementContext;
	if (ctx?.deposit_accounts) {
		return ctx.deposit_accounts.map((ac) => ({
			label: ac.name,
			value: ac.name,
		}));
	}
	return [];
});

const canSubmit = computed(() => {
	return form.value.amount > 0 && !!form.value.target_account;
});

function formatPrice(price: number | string) {
	return parseFloat(String(price) || "0").toFixed(2);
}

function openForm() {
	form.value = { target_account: "", amount: 0, reason: "" };
	if (posStore.backOfficeCashAccount) {
		const hasDefault = depositAccountOptions.value.some(
			(ac) => ac.value === posStore.backOfficeCashAccount,
		);
		if (hasDefault) {
			form.value.target_account = posStore.backOfficeCashAccount;
		}
	}
	showForm.value = true;
}

watch([fromDate, toDate], () => {
	currentPage.value = 1;
	loadDrops();
});

function handlePageChange(page: number) {
	currentPage.value = page;
	loadDrops();
}

function handlePageSizeChange(size: number) {
	pageSize.value = size;
	currentPage.value = 1;
	loadDrops();
}

async function loadDrops() {
	isLoading.value = true;
	try {
		if (isElectronMode) {
			allElectronDrops.value = (await getBankDrops({
				user: authStore.userEmail,
				fromDate: fromDate.value,
				toDate: toDate.value,
			})) as BankDrop[];
			totalDrops.value = allElectronDrops.value.length;
			const start = (currentPage.value - 1) * pageSize.value;
			drops.value = allElectronDrops.value.slice(start, start + pageSize.value);
		} else {
			const shift = posStore.posOpeningShift?.name;
			if (shift) {
				const limit_start = (currentPage.value - 1) * pageSize.value;
				const { data, total } = await paymentStore.fetchShiftCashMovements(
					shift,
					"Deposit",
					fromDate.value,
					toDate.value,
					limit_start,
					pageSize.value,
				);
				totalDrops.value = total;
				drops.value = data.map((m) => {
					const r = m as Record<string, unknown>;
					return {
						id: String(r.name || ""),
						target_account: String(r.target_account || r.account || ""),
						amount: Number(r.amount || 0),
						remarks: String(r.remarks || ""),
						posting_date: String(r.posting_date || ""),
						docstatus: r.docstatus as number,
						can_delete: r.docstatus === 0 || r.docstatus === 1,
					};
				});
			}
		}
	} catch (err) {
		console.error("Failed to load bank drops:", err);
	} finally {
		isLoading.value = false;
	}
}

async function handleSave() {
	if (!canSubmit.value) return;
	isSaving.value = true;
	try {
		if (isElectronMode) {
			await createBankDrop({
				to_account: form.value.target_account,
				amount: form.value.amount,
				remarks: form.value.reason,
				posting_date: today,
				company: posStore.companyName,
				user: authStore.userEmail,
				pos_opening_entry_id: posStore.posOpeningShift?.name
					? Number(posStore.posOpeningShift.name)
					: null,
			});
		} else {
			await paymentStore.createCashDeposit({
				pos_profile: posStore.profileName,
				company: posStore.companyName,
				target_account: form.value.target_account,
				amount: form.value.amount,
				reason: form.value.reason,
				pos_opening_shift: posStore.posOpeningShift?.name || "",
			});
		}
		showSuccess(__("Cash deposit recorded"));
		showForm.value = false;
		form.value = { target_account: "", amount: 0, reason: "" };
		await loadDrops();
	} catch (err) {
		showError(__("Failed to record deposit"));
		console.error("Failed to save bank drop:", err);
	} finally {
		isSaving.value = false;
	}
}

async function handleDelete(id: number | string) {
	try {
		if (isElectronMode) {
			await deleteBankDrop(id);
		} else {
			const { call } = await import("@/services/api");
			await call("frappe.client.cancel", { doctype: "POS Cash Movement", name: String(id) });
		}
		showSuccess(__("Deposit cancelled"));
		await loadDrops();
	} catch (err) {
		showError(__("Failed to cancel deposit"));
		console.error("Failed to delete bank drop:", err);
	}
}

async function loadContext() {
	const shift = posStore.posOpeningShift?.name;
	if (shift && posStore.profileName) {
		await paymentStore.fetchCashMovementContext(posStore.profileName, shift);
	}
}

onMounted(async () => {
	await loadContext();
	await loadDrops();
});
</script>
