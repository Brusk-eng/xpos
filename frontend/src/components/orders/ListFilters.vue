<template>
	<div class="flex flex-wrap items-center gap-2">
		<div class="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
			<DateTimePicker
				v-model="localFilters.fromDate"
				mode="date"
				placeholder="From date"
				:show-today="true"
				:clearable="true"
				class="w-36"
				@change="emitFilters"
			/>
			<span class="text-muted-foreground text-xs">to</span>
			<DateTimePicker
				v-model="localFilters.toDate"
				mode="date"
				placeholder="To date"
				:show-today="true"
				:clearable="true"
				class="w-36"
				@change="emitFilters"
			/>
		</div>
		<Select v-model="localFilters.status" @update:model-value="emitFilters">
			<SelectTriggerStyled class="h-8 w-[140px]">
				<SelectValue placeholder="Status" />
			</SelectTriggerStyled>
			<SelectContentStyled>
				<SelectItemStyled value="__all__">{{ __("All Status") }}</SelectItemStyled>
				<SelectItemStyled value="Paid">{{ __("Paid") }}</SelectItemStyled>
				<SelectItemStyled value="Unpaid">{{ __("Unpaid") }}</SelectItemStyled>
				<SelectItemStyled value="Overdue">{{ __("Overdue") }}</SelectItemStyled>
				<SelectItemStyled value="Return">{{ __("Return") }}</SelectItemStyled>
				<SelectItemStyled value="Credit Note Issued">{{ __("Credit Note Issued") }}</SelectItemStyled>
				<SelectItemStyled value="Cancelled">{{ __("Cancelled") }}</SelectItemStyled>
			</SelectContentStyled>
		</Select>

		<Select v-model="localFilters.isReturn" @update:model-value="emitFilters">
			<SelectTriggerStyled class="h-8 w-[130px]">
				<SelectValue placeholder="Type" />
			</SelectTriggerStyled>
			<SelectContentStyled>
				<SelectItemStyled value="__all__">{{ __("All Types") }}</SelectItemStyled>
				<SelectItemStyled value="0">{{ __("Sales") }}</SelectItemStyled>
				<SelectItemStyled value="1">{{ __("Returns") }}</SelectItemStyled>
			</SelectContentStyled>
		</Select>

		<Select v-model="localFilters.orderBy" @update:model-value="emitFilters">
			<SelectTriggerStyled class="h-8 w-[160px]">
				<SelectValue placeholder="Sort By" />
			</SelectTriggerStyled>
			<SelectContentStyled>
				<SelectItemStyled value="posting_date desc, posting_time desc">{{
					__("Date (Newest)")
				}}</SelectItemStyled>
				<SelectItemStyled value="posting_date asc, posting_time asc">{{
					__("Date (Oldest)")
				}}</SelectItemStyled>
				<SelectItemStyled value="grand_total desc">{{ __("Amount (High)") }}</SelectItemStyled>
				<SelectItemStyled value="grand_total asc">{{ __("Amount (Low)") }}</SelectItemStyled>
				<SelectItemStyled value="name desc">{{ __("Invoice # (Newest)") }}</SelectItemStyled>
				<SelectItemStyled value="name asc">{{ __("Invoice # (Oldest)") }}</SelectItemStyled>
			</SelectContentStyled>
		</Select>

		<div class="flex-1"></div>

		<div class="relative">
			<Button
				ref="filterBtnRef"
				variant="outline"
				size="sm"
				class="h-8 gap-1"
				:class="{
					'bg-primary text-primary-foreground hover:bg-primary/90': queryFilters.length > 0,
				}"
				@click="openFilterPanel"
			>
				<Filter class="h-3.5 w-3.5" />
				Filters
				<Badge
					v-if="queryFilters.length > 0"
					:variant="queryFilters.length > 0 ? 'secondary' : 'outline'"
					class="ms-1 h-5 min-w-5 px-1.5 bg-background text-foreground"
				>
					{{ queryFilters.length }}
				</Badge>
			</Button>

			<Teleport to="body">
				<div
					v-if="showQueryPopover"
					class="fixed inset-0 z-[998]"
					@click="showQueryPopover = false"
				/>

				<div
					v-if="showQueryPopover"
					class="fixed z-[999] w-[min(500px,calc(100vw-1rem))] bg-popover border border-border rounded-lg shadow-lg"
					:style="panelStyle"
				>
					<div class="p-3 border-b border-border">
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-foreground">{{
								__("Query Filters")
							}}</span>
							<Button variant="outline" size="sm" class="h-7 text-xs" @click="addQueryFilter">
								<Plus class="h-3 w-3" />
								{{ __("Add Filter") }}
							</Button>
						</div>
					</div>

					<div class="p-3 space-y-2 max-h-[300px] overflow-y-auto">
						<div
							v-for="(filter, index) in queryFilters"
							:key="index"
							class="flex items-center gap-2"
						>
							<Autocomplete
								v-model="filter.field"
								:options="filterFieldOptions"
								:placeholder="__('Search fields...')"
								:show-search-icon="false"
								:clearable="false"
								:max-visible="10"
								:empty-text="__('No fields found')"
								class="w-[150px]"
								@update:model-value="emitFilters"
							/>

							<Select v-model="filter.operator" @update:model-value="emitFilters">
								<SelectTriggerStyled class="h-8 w-[100px]">
									<SelectValue :placeholder="__('Op')" />
								</SelectTriggerStyled>
								<SelectContentStyled>
									<SelectItemStyled
										v-for="op in getOperators(filter.field)"
										:key="op.value"
										:value="op.value"
									>
										{{ op.label }}
									</SelectItemStyled>
								</SelectContentStyled>
							</Select>

							<Input
								v-if="!['is', 'is not'].includes(filter.operator)"
								v-model="filter.value"
								type="text"
								:placeholder="__('Value')"
								class="h-8 flex-1"
								@change="emitFilters"
							/>
							<Select v-else v-model="filter.value" @update:model-value="emitFilters">
								<SelectTriggerStyled class="h-8 flex-1">
									<SelectValue :placeholder="__('Value')" />
								</SelectTriggerStyled>
								<SelectContentStyled>
									<SelectItemStyled value="set">{{
										__("Set (has value)")
									}}</SelectItemStyled>
									<SelectItemStyled value="not set">{{
										__("Not Set (empty)")
									}}</SelectItemStyled>
								</SelectContentStyled>
							</Select>

							<Button
								variant="ghost"
								size="icon-sm"
								class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
								@click="removeQueryFilter(index)"
							>
								<X class="h-3.5 w-3.5" />
							</Button>
						</div>

						<div
							v-if="queryFilters.length === 0"
							class="text-sm text-muted-foreground py-4 text-center"
						>
							{{ __('No query filters. Click "Add Filter" to add one.') }}
						</div>
					</div>

					<div
						v-if="queryFilters.length > 0"
						class="p-3 border-t border-border flex justify-end gap-2"
					>
						<Button variant="ghost" size="sm" class="h-7" @click="clearQueryFilters">
							{{ __("Clear All") }}
						</Button>
						<Button size="sm" class="h-7" @click="showQueryPopover = false">
							{{ __("Apply") }}
						</Button>
					</div>
				</div>
			</Teleport>
		</div>

		<Button variant="outline" size="sm" class="h-8" @click="$emit('refresh')">
			<RefreshCw class="h-3.5 w-3.5" />
		</Button>

		<Button
			v-if="hasActiveFilters"
			variant="ghost"
			size="sm"
			class="h-8 text-muted-foreground hover:text-foreground"
			@click="clearFilters"
		>
			<X class="h-3.5 w-3.5" />
			{{ __("Clear") }}
		</Button>
	</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { Autocomplete } from "@/components/ui/autocomplete";
import type { AutocompleteOption } from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectTriggerStyled,
	SelectContentStyled,
	SelectItemStyled,
	SelectValue,
} from "@/components/ui/select";
import { Filter, Plus, X, RefreshCw } from "lucide-vue-next";
import __ from "@/lib/translate";

interface QueryFilter {
	field: string;
	operator: string;
	value: string;
}

interface FilterField {
	label: string;
	value: string;
	type: "text" | "number" | "date" | "select";
	options?: { label: string; value: string }[];
}

const props = withDefaults(
	defineProps<{
		fromDate: string;
		toDate: string;
	}>(),
	{
		fromDate: "",
		toDate: "",
	},
);

const emit = defineEmits<{
	(
		e: "update",
		filters: {
			fromDate: string;
			toDate: string;
			status: string;
			isReturn: string;
			orderBy: string;
			queryFilters: [string, string, string][];
		},
	): void;
	(e: "refresh"): void;
}>();

const showQueryPopover = ref(false);
const filterBtnRef = ref<InstanceType<typeof Button> | null>(null);
const panelStyle = ref<Record<string, string>>({});

function openFilterPanel() {
	const el = (filterBtnRef.value as any)?.$el as HTMLElement | undefined;
	if (el) {
		const rect = el.getBoundingClientRect();
		const panelWidth = Math.min(500, window.innerWidth - 16);
		let left = rect.right - panelWidth;
		if (left < 8) left = 8;
		panelStyle.value = {
			top: rect.bottom + 4 + "px",
			left: left + "px",
			width: panelWidth + "px",
		};
	}
	showQueryPopover.value = !showQueryPopover.value;
}

const localFilters = reactive({
	fromDate: props.fromDate,
	toDate: props.toDate,
	status: "__all__",
	isReturn: "__all__",
	orderBy: "posting_date desc, posting_time desc",
});

const queryFilters = ref<QueryFilter[]>([]);

const filterFields: FilterField[] = [
	{ label: __("Invoice ID"), value: "name", type: "text" },
	{ label: __("Customer"), value: "customer", type: "text" },
	{ label: __("Customer Name"), value: "customer_name", type: "text" },
	{ label: __("Grand Total"), value: "grand_total", type: "number" },
	{ label: __("Net Total"), value: "net_total", type: "number" },
	{ label: __("Paid Amount"), value: "paid_amount", type: "number" },
	{ label: __("Outstanding"), value: "outstanding_amount", type: "number" },
	{ label: __("Return Against"), value: "return_against", type: "text" },
	{ label: __("Owner"), value: "owner", type: "text" },
];

const filterFieldOptions = computed<AutocompleteOption[]>(() =>
	filterFields.map((f) => ({ label: f.label, value: f.value, description: f.type })),
);

const textOperators = [
	{ label: "equals", value: "=" },
	{ label: "not equals", value: "!=" },
	{ label: "like", value: "like" },
	{ label: "not like", value: "not like" },
	{ label: "is", value: "is" },
	{ label: "is not", value: "is not" },
];

const numberOperators = [
	{ label: "=", value: "=" },
	{ label: "!=", value: "!=" },
	{ label: ">", value: ">" },
	{ label: "<", value: "<" },
	{ label: ">=", value: ">=" },
	{ label: "<=", value: "<=" },
	{ label: "is", value: "is" },
	{ label: "is not", value: "is not" },
];

function getOperators(fieldValue: string) {
	const field = filterFields.find((f) => f.value === fieldValue);
	if (!field) return textOperators;
	return field.type === "number" ? numberOperators : textOperators;
}

const hasActiveFilters = computed(() => {
	return (
		localFilters.status !== "__all__" ||
		localFilters.isReturn !== "__all__" ||
		queryFilters.value.length > 0
	);
});

function addQueryFilter() {
	queryFilters.value.push({
		field: "customer_name",
		operator: "like",
		value: "",
	});
}

function removeQueryFilter(index: number) {
	queryFilters.value.splice(index, 1);
	emitFilters();
}

function clearQueryFilters() {
	queryFilters.value = [];
	emitFilters();
}

function clearFilters() {
	localFilters.status = "__all__";
	localFilters.isReturn = "__all__";
	queryFilters.value = [];
	emitFilters();
}

function emitFilters() {
	const builtFilters: [string, string, string][] = [];
	if (localFilters.status !== "__all__") {
		builtFilters.push(["status", "=", localFilters.status]);
	}

	if (localFilters.isReturn !== "__all__") {
		builtFilters.push(["is_return", "=", localFilters.isReturn]);
	}

	for (const f of queryFilters.value) {
		if (f.field && f.operator && (f.value || ["is", "is not"].includes(f.operator))) {
			builtFilters.push([f.field, f.operator, f.value]);
		}
	}

	emit("update", {
		fromDate: localFilters.fromDate,
		toDate: localFilters.toDate,
		status: localFilters.status,
		isReturn: localFilters.isReturn,
		orderBy: localFilters.orderBy,
		queryFilters: builtFilters,
	});
}

watch(
	() => props.fromDate,
	(val) => {
		localFilters.fromDate = val;
	},
);

watch(
	() => props.toDate,
	(val) => {
		localFilters.toDate = val;
	},
);
</script>
