<template>
	<Dialog :open="!!mode" @update:open="(val: boolean) => !val && close()">
		<DialogContent class="max-w-lg flex flex-col p-0 gap-0 max-h-[90vh]">
			<DialogHeader class="shrink-0 px-5 pt-5 pb-3 border-b border-border">
				<div class="flex items-center gap-2">
					<div
						class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"
					>
						<ClipboardList v-if="mode === 'order'" class="w-4 h-4" />
						<FileText v-else class="w-4 h-4" />
					</div>
					<div>
						<DialogTitle class="text-base">
							{{ mode === "order" ? __("Save as Sales Order") : __("Save as Quotation") }}
						</DialogTitle>
						<DialogDescription class="text-xs">
							{{ cartStore.customerName }} · {{ money(cartStore.grandTotal) }}
						</DialogDescription>
					</div>
				</div>
			</DialogHeader>

			<div class="p-5 space-y-4 overflow-y-auto">
				<div v-if="mode === 'order'" class="grid grid-cols-2 gap-3">
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Delivery date") }}
						</label>
						<DateTimeInput
							v-model="deliveryDate"
							mode="date"
							:placeholder="__('Delivery date')"
							data-testid="so-delivery-date"
						/>
					</div>
					<div>
						<label class="text-sm font-semibold text-foreground mb-1.5 block">
							{{ __("Customer PO") }}
						</label>
						<Input v-model="poNo" :placeholder="__('Optional')" />
					</div>
				</div>
				<div v-else>
					<label class="text-sm font-semibold text-foreground mb-1.5 block">
						{{ __("Valid till") }}
					</label>
					<DateTimeInput v-model="validTill" mode="date" :placeholder="__('Optional')" />
				</div>

				<div v-if="mode === 'order' && lines.length > 1">
					<button
						type="button"
						class="text-xs font-semibold text-primary"
						:aria-expanded="showLineDates"
						@click="showLineDates = !showLineDates"
					>
						{{
							showLineDates
								? __("Hide per-line delivery dates")
								: __("Set per-line delivery dates")
						}}
					</button>
					<ul v-if="showLineDates" class="mt-2 space-y-2">
						<li v-for="line in lines" :key="line.uid" class="flex items-center gap-2 text-sm">
							<span class="flex-1 truncate">{{ line.item_name }} × {{ line.qty }}</span>
							<DateTimeInput
								v-model="lineDates[line.uid as string]"
								mode="date"
								class="w-40"
								:placeholder="deliveryDate || __('Order date')"
							/>
						</li>
					</ul>
				</div>

				<div>
					<label class="text-sm font-semibold text-foreground mb-1.5 block">
						{{ __("Shipping address") }}
					</label>
					<Select
						v-model="shippingAddress"
						:items="addressOptions"
						:placeholder="
							addressOptions.length ? __('Select address') : __('No addresses on file')
						"
						:disabled="!addressOptions.length"
					/>
				</div>

				<div v-if="mode === 'order'">
					<label class="text-sm font-semibold text-foreground mb-1.5 block">
						{{ __("Project") }}
					</label>
					<Autocomplete
						v-model="project"
						doctype="Project"
						:filters="{ company: posStore.companyName }"
						:placeholder="__('Optional')"
						clearable
					/>
				</div>

				<div>
					<label class="text-sm font-semibold text-foreground mb-1.5 block" for="so-notes">
						{{ __("Notes") }}
					</label>
					<textarea
						id="so-notes"
						v-model="notes"
						rows="2"
						class="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>

				<section v-if="canTakeDeposit" class="rounded-xl border border-border p-3 space-y-3">
					<p class="text-sm font-semibold">{{ __("Deposit") }}</p>
					<div class="grid grid-cols-2 gap-3">
						<NumberInput
							v-model="depositAmount"
							:min="0"
							:max="cartStore.grandTotal"
							:placeholder="__('Amount')"
							data-testid="so-deposit"
						/>
						<Select
							v-model="depositMode"
							:items="modeOptions"
							:placeholder="__('Mode of payment')"
						/>
					</div>
					<p class="text-xs text-muted-foreground">
						{{ __("Deducted from the invoice when the order is billed.") }}
					</p>
				</section>
			</div>

			<DialogFooter class="shrink-0 border-t border-border px-5 py-4">
				<Button variant="outline" class="flex-1" @click="close">
					{{ __("Cancel") }}
				</Button>
				<Button class="flex-1" :disabled="!canSubmit" data-testid="so-confirm" @click="submit">
					<Loader2 v-if="isSaving" class="w-4 h-4 me-2 animate-spin" />
					{{ mode === "order" ? __("Save Order") : __("Save Quotation") }}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { useCartStore } from "@/stores/cartStore";
import { useMoney } from "@/composables/useMoney";
import { call, showSuccess, showError } from "@/services/api";
import { extractErrorMessage } from "@/utils";
import { nowDate } from "@/utils/datetime";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Autocomplete } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { ClipboardList, FileText, Loader2 } from "lucide-vue-next";
import { __ } from "@/lib/translate";
import type { CustomerAddress } from "@/types/pos.types";

const props = defineProps<{ mode: "order" | "quotation" | null }>();
const emit = defineEmits<{ (e: "close"): void; (e: "saved", name: string): void }>();

const posStore = usePosStore();
const cartStore = useCartStore();
const { money } = useMoney();

const deliveryDate = ref("");
const validTill = ref("");
const poNo = ref("");
const project = ref("");
const notes = ref("");
const shippingAddress = ref("");
const addresses = ref<CustomerAddress[]>([]);
const lineDates = ref<Record<string, string>>({});
const showLineDates = ref(false);
const depositAmount = ref(0);
const depositMode = ref("");
const isSaving = ref(false);

/** Free and offer lines are left to ERPNext's own pricing rules on the document. */
const lines = computed(() =>
	cartStore.items.filter((i) => !i.pos_is_free_item && !i.pos_is_offer && !i.gift_card_issue && i.qty > 0),
);

const addressOptions = computed(() =>
	addresses.value.map((a) => ({
		label: [a.address_title, a.address_line1, a.city].filter(Boolean).join(", "),
		value: a.name,
	})),
);

const modeOptions = computed(() =>
	(posStore.posProfile?.payments || []).map((p) => ({
		label: p.mode_of_payment,
		value: p.mode_of_payment,
	})),
);

// only a Sales Invoice can deduct the deposit when the order is billed
const canTakeDeposit = computed(
	() =>
		props.mode === "order" &&
		posStore.invoiceType === "Sales Invoice" &&
		!!posStore.posOpeningShift?.name,
);

const pastDate = computed(() => {
	const today = nowDate();
	return [deliveryDate.value, ...Object.values(lineDates.value)].some((d) => d && d < today);
});

const canSubmit = computed(
	() =>
		!isSaving.value &&
		!!cartStore.customer?.name &&
		lines.value.length > 0 &&
		!pastDate.value &&
		(depositAmount.value <= 0 || !!depositMode.value),
);

watch(
	() => props.mode,
	async (mode) => {
		if (!mode) return;
		deliveryDate.value = nowDate();
		validTill.value = "";
		poNo.value = "";
		project.value = "";
		notes.value = cartStore.orderNotes || "";
		lineDates.value = {};
		showLineDates.value = false;
		depositAmount.value = 0;
		depositMode.value =
			posStore.posProfile?.payments?.find((p) => p.default)?.mode_of_payment ||
			modeOptions.value[0]?.value ||
			"";
		shippingAddress.value = "";
		addresses.value = [];
		const customer = cartStore.customer?.name;
		if (!customer) return;
		try {
			addresses.value = await call<CustomerAddress[]>("xpos.api.customers.get_customer_addresses", {
				customer,
			});
			shippingAddress.value =
				addresses.value.find((a) => a.is_shipping_address)?.name ||
				addresses.value.find((a) => a.is_primary_address)?.name ||
				"";
		} catch {
			addresses.value = [];
		}
	},
	{ immediate: true },
);

function close() {
	if (isSaving.value) return;
	emit("close");
}

async function submit() {
	if (!canSubmit.value || !props.mode) return;
	const isOrder = props.mode === "order";
	const data = {
		pos_profile: posStore.profileName,
		customer: cartStore.customer?.name,
		items: lines.value.map((i) => ({
			item_code: i.item_code,
			qty: i.qty,
			uom: i.uom || i.stock_uom,
			price_list_rate: i.rate,
			discount_percentage: i.discount_percentage,
			additional_notes: i.pos_notes,
			delivery_date: isOrder ? lineDates.value[i.uid as string] || undefined : undefined,
			quotation: i.quotation,
			quotation_item: i.quotation_item,
		})),
		delivery_date: isOrder ? deliveryDate.value : undefined,
		valid_till: isOrder ? undefined : validTill.value || undefined,
		po_no: isOrder ? poNo.value : undefined,
		project: isOrder ? project.value : undefined,
		shipping_address_name: shippingAddress.value,
		notes: notes.value,
		sales_person: cartStore.salesPerson || undefined,
		additional_discount_percentage: cartStore.discountPercentage || undefined,
		discount_amount: cartStore.discountPercentage ? undefined : cartStore.discountAmount || undefined,
		deposits:
			isOrder && canTakeDeposit.value && depositAmount.value > 0
				? [{ mode_of_payment: depositMode.value, amount: depositAmount.value }]
				: [],
		pos_opening_shift: posStore.posOpeningShift?.name,
	};

	isSaving.value = true;
	try {
		const result = await call<{ name: string; deposit?: number }>(
			isOrder ? "xpos.api.sales_orders.create_sales_order" : "xpos.api.sales_orders.create_quotation",
			{ data },
		);
		showSuccess(
			isOrder
				? result.deposit
					? __("Sales Order {0} saved with a deposit of {1}", [result.name, money(result.deposit)])
					: __("Sales Order {0} saved", [result.name])
				: __("Quotation {0} saved", [result.name]),
		);
		cartStore.clearAll();
		emit("saved", result.name);
	} catch (error: unknown) {
		showError(extractErrorMessage(error));
	} finally {
		isSaving.value = false;
	}
}
</script>
