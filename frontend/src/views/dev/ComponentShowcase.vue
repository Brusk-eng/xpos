<script setup lang="ts">
/**
 * Pearl component showcase — development builds only (route registered behind import.meta.env.DEV).
 * Query params for screenshots: ?theme=light|dark&dir=ltr|rtl&density=comfortable|compact
 */
import { computed, inject, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { Bell, Minus, PackageSearch, Plus, Printer, Search, ShoppingCart, Trash2 } from "lucide-vue-next";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { Badge } from "@/components/ui/badge";
import { XposLogo } from "@/components/ui/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	cardVariants,
} from "@/components/ui/card";
import Checkbox from "@/components/ui/checkbox/Checkbox.vue";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input, inputVariants } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContentStyled, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { Table, type TableColumn, type TableRow } from "@/components/ui/table";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";
type Density = "comfortable" | "compact";

const route = useRoute();
const theme = inject<Ref<Theme>>("theme", ref<Theme>("light"));
const previousTheme = theme.value;
const previousDir = document.documentElement.dir;

const dir = ref<"ltr" | "rtl">(route.query.dir === "rtl" ? "rtl" : "ltr");
const density = ref<Density>(route.query.density === "compact" ? "compact" : "comfortable");
if (route.query.theme === "dark" || route.query.theme === "light") theme.value = route.query.theme;

watch(dir, (value) => (document.documentElement.dir = value), { immediate: true });
onUnmounted(() => {
	theme.value = previousTheme;
	document.documentElement.dir = previousDir;
});

const compact = computed(() => density.value === "compact");
const buttonSize = computed(() => (compact.value ? "sm" : "default"));
const iconSize = computed(() => (compact.value ? "icon-sm" : "icon"));
const fieldSize = computed(() => (compact.value ? "compact" : "default"));

/**
 * Hover/pressed/focus can't be forced with CSS pseudo-classes, so the matrix re-applies the
 * variant's own `hover:` / `active:` / `focus-visible:` utilities without their prefix.
 */
const STATE_PREFIXES = {
	hover: ["hover:"],
	pressed: ["active:", "motion-safe:active:"],
	focus: ["focus-visible:"],
	selected: ["aria-pressed:", "aria-selected:"],
	invalid: ["aria-[invalid=true]:"],
} as const;

function forced(classes: string, state: keyof typeof STATE_PREFIXES): string {
	return classes
		.split(/\s+/)
		.map((cls) => STATE_PREFIXES[state].find((prefix) => cls.startsWith(prefix)) && cls)
		.filter((cls): cls is string => !!cls)
		.map((cls) => cls.slice(cls.lastIndexOf(":") + 1))
		.join(" ");
}

const buttonVariantNames = [
	"default",
	"outline",
	"secondary",
	"ghost",
	"destructive",
	"success",
	"link",
] as const;
const buttonStates = ["default", "hover", "pressed", "selected", "focus", "disabled", "loading"] as const;

function buttonStateClass(
	variant: (typeof buttonVariantNames)[number],
	state: (typeof buttonStates)[number],
) {
	if (state === "default" || state === "disabled" || state === "loading" || state === "selected") return "";
	return forced(buttonVariants({ variant }), state);
}

/*
 * Tailwind only generates classes it finds in source. The forced-state matrix strips prefixes at
 * runtime, so the unprefixed forms are listed here (regenerate when variants change):
 * bg-card bg-destructive/90 bg-primary/90 bg-success/90 bg-surface-hover bg-surface-pressed bg-surface-selected border-border-strong border-destructive border-focus border-primary decoration-primary outline-none ring-1 ring-2 ring-destructive/25 ring-focus ring-focus/35 ring-offset-2 ring-offset-background ring-primary ring-primary/40 shadow-pressed shadow-raised-hover text-surface-selected-foreground translate-y-px
 */
const fieldStates = ["default", "hover", "focus", "invalid", "disabled", "readonly"] as const;
function fieldStateClass(state: (typeof fieldStates)[number]) {
	if (state === "hover" || state === "focus" || state === "invalid") return forced(inputVariants(), state);
	return "";
}

const cardStates = ["default", "hover", "pressed", "selected", "focus"] as const;
function cardStateClass(state: (typeof cardStates)[number]) {
	return state === "default" ? "" : forced(cardVariants({ variant: "interactive" }), state);
}

const selectValue = ref("cash");
const paymentItems = [
	{ label: "Cash", value: "cash" },
	{ label: "Card", value: "card" },
	{ label: "Bank Transfer", value: "bank" },
	{ label: "Gift Card", value: "gift" },
];

const customer = ref("");
const customerOptions: AutocompleteOption[] = [
	{ label: "Walk-in Customer", value: "walk-in", description: "Default customer" },
	{ label: "Ayesha Khan", value: "ayesha", description: "0300 1234567" },
	{ label: "Bilal Traders", value: "bilal", description: "Wholesale" },
	{ label: "City Mart", value: "city", description: "Credit account" },
];

const qty = ref(2);
const price = ref(1500);
const search = ref("");
const invalidName = ref("");
const checked = ref(true);
const retrying = ref(false);

function retry() {
	retrying.value = true;
	setTimeout(() => (retrying.value = false), 1200);
}

const tableColumns: TableColumn[] = [
	{ fieldname: "item_code", label: "Item", type: "text", width: "200px" },
	{ fieldname: "qty", label: "Qty", type: "number", width: "100px", align: "right" },
	{ fieldname: "rate", label: "Rate", type: "number", width: "120px", align: "right", precision: 2 },
	{ fieldname: "uom", label: "UOM", type: "readonly", width: "100px" },
];
const tableRows = ref<TableRow[]>([
	{ item_code: "IT-00043 HD Webcam", qty: 1, rate: 1500, uom: "Nos" },
	{ item_code: "IT-00035 USB-C Charger", qty: 2, rate: 1200, uom: "Nos" },
	{ item_code: "IT-00025 Power Bank", qty: 1, rate: 3500, uom: "Nos" },
]);

const swatches = [
	["background", "Page"],
	["card", "Card"],
	["surface-raised", "Raised"],
	["surface-sunken", "Sunken"],
	["surface-selected", "Selected"],
	["primary", "Primary"],
	["foreground", "Text"],
	["muted-foreground", "Muted text"],
	["border", "Border"],
	["input", "Field border"],
	["success", "Success"],
	["warning", "Warning"],
	["info", "Info"],
	["destructive", "Destructive"],
] as const;

const sections = [
	["brand", "Brand"],
	["tokens", "Tokens"],
	["buttons", "Buttons"],
	["fields", "Fields"],
	["select", "Select & search"],
	["numbers", "Quantity"],
	["cards", "Cards"],
	["badges", "Badges"],
	["overlays", "Overlays"],
	["data", "Table & states"],
] as const;

const isDark = inject<Ref<boolean>>("isDark", ref(false));
const isDarkTheme = computed(() => isDark.value);

onMounted(() => {
	document.title = "Pearl showcase | X POS";
});
</script>

<template>
	<div class="h-dvh overflow-y-auto bg-background text-foreground">
		<header
			class="border-b border-border bg-card px-4 py-3 shadow-raised sm:sticky sm:top-0 sm:z-30 sm:px-6"
			data-testid="showcase-toolbar"
		>
			<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
				<XposLogo variant="full" :size="32" subtitle="Pearl component system" />
				<div class="ms-auto flex flex-wrap items-center gap-2">
					<div
						class="inline-flex gap-1 rounded-lg border border-border bg-surface-sunken p-1"
						role="group"
						aria-label="Theme"
					>
						<Button
							v-for="t in ['light', 'dark'] as const"
							:key="t"
							size="sm"
							variant="ghost"
							:aria-pressed="t === 'dark' ? isDarkTheme : !isDarkTheme"
							@click="theme = t"
						>
							{{ t === "light" ? "Light" : "Dark" }}
						</Button>
					</div>
					<div
						class="inline-flex gap-1 rounded-lg border border-border bg-surface-sunken p-1"
						role="group"
						aria-label="Direction"
					>
						<Button
							v-for="d in ['ltr', 'rtl'] as const"
							:key="d"
							size="sm"
							variant="ghost"
							:aria-pressed="dir === d"
							@click="dir = d"
						>
							{{ d.toUpperCase() }}
						</Button>
					</div>
					<div
						class="inline-flex gap-1 rounded-lg border border-border bg-surface-sunken p-1"
						role="group"
						aria-label="Density"
					>
						<Button
							v-for="d in ['comfortable', 'compact'] as const"
							:key="d"
							size="sm"
							variant="ghost"
							:aria-pressed="density === d"
							@click="density = d"
						>
							{{ d === "comfortable" ? "Comfortable" : "Compact" }}
						</Button>
					</div>
				</div>
			</div>
			<nav class="mx-auto mt-2 flex max-w-7xl gap-1 overflow-x-auto pb-1" aria-label="Sections">
				<a
					v-for="[id, label] in sections"
					:key="id"
					:href="`#${id}`"
					class="shrink-0 rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground no-underline hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
				>
					{{ label }}
				</a>
			</nav>
		</header>

		<main class="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6">
			<!-- Brand -->
			<section id="brand" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Brand</h2>
				<Card class="overflow-hidden p-0">
					<div
						v-for="surface in ['bg-background', 'bg-card', 'bg-surface-sunken']"
						:key="surface"
						:class="
							cn(
								'flex flex-wrap items-end gap-7 border-b border-border p-6 last:border-b-0',
								surface,
							)
						"
					>
						<XposLogo v-for="s in [16, 20, 24, 32, 48, 64, 128]" :key="s" :size="s" />
						<div class="flex flex-col gap-4">
							<XposLogo variant="full" version="v3" :size="32" />
							<XposLogo variant="full" :size="32" subtitle="Stores - KL" />
						</div>
					</div>
				</Card>
			</section>

			<!-- Tokens -->
			<section id="tokens" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Tokens</h2>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
					<div
						v-for="[token, label] in swatches"
						:key="token"
						class="overflow-hidden rounded-lg border border-border bg-card"
					>
						<div
							class="h-12 border-b border-border"
							:style="{ background: `hsl(var(--${token}))` }"
						/>
						<div class="px-2.5 py-2">
							<p class="text-sm font-semibold">{{ label }}</p>
							<p class="truncate font-mono text-xs text-muted-foreground">--{{ token }}</p>
						</div>
					</div>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="rounded-xl border border-border bg-card p-4 shadow-raised">
						<p class="text-sm font-semibold">Raised</p>
						<p class="text-sm text-muted-foreground">shadow-raised + border</p>
					</div>
					<div class="rounded-xl border border-border bg-surface-sunken p-4 shadow-inset">
						<p class="text-sm font-semibold">Recessed</p>
						<p class="text-sm text-muted-foreground">shadow-inset + border</p>
					</div>
					<div class="rounded-xl border border-border bg-popover p-4 shadow-overlay">
						<p class="text-sm font-semibold">Overlay</p>
						<p class="text-sm text-muted-foreground">shadow-overlay for dialogs and menus</p>
					</div>
				</div>
			</section>

			<!-- Buttons -->
			<section id="buttons" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Buttons</h2>
				<Card class="overflow-x-auto p-4 sm:p-6">
					<table class="w-full border-separate border-spacing-x-3 border-spacing-y-3 text-sm">
						<thead>
							<tr>
								<th
									class="text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>
									Variant
								</th>
								<th
									v-for="state in buttonStates"
									:key="state"
									class="text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
								>
									{{ state }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="variant in buttonVariantNames" :key="variant">
								<th class="whitespace-nowrap text-start font-medium">{{ variant }}</th>
								<td v-for="state in buttonStates" :key="state">
									<Button
										:variant="variant"
										:size="buttonSize"
										:class="buttonStateClass(variant, state)"
										:disabled="state === 'disabled'"
										:loading="state === 'loading'"
										:aria-pressed="state === 'selected' ? 'true' : undefined"
									>
										<ShoppingCart />
										Pay
									</Button>
								</td>
							</tr>
						</tbody>
					</table>
				</Card>
				<Card class="flex flex-wrap items-center gap-3 p-4 sm:p-6">
					<Button size="sm">Small</Button>
					<Button>Default</Button>
					<Button size="lg">Large</Button>
					<Button size="touch">Touch 44px</Button>
					<Button size="xl">Pay PKR 7,400</Button>
					<span class="mx-2 h-8 w-px bg-border" aria-hidden="true" />
					<TooltipWrapper content="Print receipt">
						<Button variant="outline" :size="iconSize" aria-label="Print receipt"
							><Printer
						/></Button>
					</TooltipWrapper>
					<Button variant="outline" :size="iconSize" aria-label="Notifications" aria-pressed="true"
						><Bell
					/></Button>
					<Button variant="ghost" :size="iconSize" aria-label="Remove line"><Trash2 /></Button>
					<Button variant="outline" size="icon-touch" aria-label="Add one"><Plus /></Button>
				</Card>
			</section>

			<!-- Fields -->
			<section id="fields" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Fields</h2>
				<Card class="grid gap-5 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
					<label v-for="state in fieldStates" :key="state" class="space-y-1.5">
						<span class="text-sm font-medium capitalize">{{ state }}</span>
						<Input
							:size="fieldSize"
							:model-value="state === 'readonly' ? 'INV-2026-00042' : ''"
							:placeholder="state === 'invalid' ? 'Required' : 'Customer name'"
							:class="fieldStateClass(state)"
							:disabled="state === 'disabled'"
							:readonly="state === 'readonly'"
							:aria-invalid="state === 'invalid' ? 'true' : undefined"
						/>
					</label>
					<label class="space-y-1.5">
						<span class="text-sm font-medium">Live invalid (type to clear)</span>
						<Input
							v-model="invalidName"
							:size="fieldSize"
							placeholder="Required field"
							:aria-invalid="invalidName ? undefined : 'true'"
							aria-describedby="showcase-name-error"
						/>
						<span
							v-if="!invalidName"
							id="showcase-name-error"
							class="block text-sm font-medium text-destructive-soft-foreground"
						>
							Customer name is required.
						</span>
					</label>
					<label class="space-y-1.5">
						<span class="text-sm font-medium">Search field</span>
						<span class="relative block">
							<Search
								class="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								v-model="search"
								:size="fieldSize"
								class="ps-9"
								placeholder="Search products or scan barcode..."
							/>
						</span>
					</label>
					<label class="flex items-center gap-2.5 self-end pb-2 text-sm font-medium">
						<Checkbox v-model:checked="checked" />
						Print receipt after payment
					</label>
				</Card>
			</section>

			<!-- Select & search -->
			<section id="select" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Select &amp; search</h2>
				<Card class="grid gap-5 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
					<div class="space-y-1.5">
						<span class="text-sm font-medium">Mode of payment</span>
						<Select v-model="selectValue" :items="paymentItems" placeholder="Select payment" />
					</div>
					<div class="space-y-1.5">
						<span class="text-sm font-medium">Disabled select</span>
						<Select model-value="card" :items="paymentItems" disabled />
					</div>
					<Autocomplete
						v-model="customer"
						:options="customerOptions"
						label="Customer"
						placeholder="Search customer..."
						show-search-icon
						:compact="compact"
					/>
				</Card>
			</section>

			<!-- Quantity -->
			<section id="numbers" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Quantity &amp; number inputs</h2>
				<Card class="grid gap-5 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
					<div class="space-y-1.5">
						<span class="text-sm font-medium">Quantity stepper</span>
						<div class="flex items-center gap-1.5">
							<Button
								variant="outline"
								:size="iconSize"
								aria-label="Decrease quantity"
								:disabled="qty <= 1"
								@click="qty--"
							>
								<Minus />
							</Button>
							<NumberInput
								v-model="qty"
								:min="1"
								:allow-decimal="false"
								:size="fieldSize"
								class="w-16 text-center"
								aria-label="Quantity"
							/>
							<Button
								variant="outline"
								:size="iconSize"
								aria-label="Increase quantity"
								@click="qty++"
							>
								<Plus />
							</Button>
						</div>
					</div>
					<label class="space-y-1.5">
						<span class="text-sm font-medium">Rate</span>
						<NumberInput v-model="price" :precision="2" :size="fieldSize" class="text-end" />
					</label>
					<label class="space-y-1.5">
						<span class="text-sm font-medium">Invalid amount</span>
						<NumberInput
							:model-value="-50"
							:size="fieldSize"
							aria-invalid="true"
							class="text-end"
						/>
					</label>
					<label class="space-y-1.5">
						<span class="text-sm font-medium">Disabled</span>
						<NumberInput :model-value="0" :size="fieldSize" disabled class="text-end" />
					</label>
				</Card>
			</section>

			<!-- Cards -->
			<section id="cards" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Cards &amp; surfaces</h2>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<Card v-for="v in ['raised', 'flat', 'sunken'] as const" :key="v" :variant="v">
						<CardHeader>
							<CardTitle class="capitalize">{{ v }}</CardTitle>
							<CardDescription>Card variant="{{ v }}"</CardDescription>
						</CardHeader>
						<CardContent class="text-sm"
							>Subtotal
							<span class="float-end font-semibold tabular-nums">PKR 7,400</span></CardContent
						>
					</Card>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<Card
						v-for="state in cardStates"
						:key="state"
						variant="interactive"
						tabindex="0"
						role="button"
						:aria-selected="state === 'selected' ? 'true' : undefined"
						:class="cn('p-4', cardStateClass(state))"
					>
						<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{{ state }}
						</p>
						<p class="mt-1 font-semibold">HD Webcam</p>
						<p class="font-mono text-xs text-muted-foreground">IT-00043</p>
						<div class="mt-3 flex items-center justify-between gap-2">
							<span class="font-bold tabular-nums">PKR 1,500</span>
							<Badge variant="success" size="sm" dot>996</Badge>
						</div>
					</Card>
				</div>
			</section>

			<!-- Badges -->
			<section id="badges" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Badges &amp; status</h2>
				<Card class="space-y-4 p-4 sm:p-6">
					<div class="flex flex-wrap items-center gap-2">
						<Badge
							v-for="v in [
								'default',
								'secondary',
								'outline',
								'neutral',
								'success',
								'warning',
								'info',
								'destructive',
							] as const"
							:key="v"
							:variant="v"
						>
							{{ v }}
						</Badge>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="success" dot>Online</Badge>
						<Badge variant="warning" dot>3 pending sync</Badge>
						<Badge variant="destructive" dot>Offline</Badge>
						<Badge variant="info" dot>Draft</Badge>
						<Badge variant="neutral" size="sm">Small</Badge>
						<Badge variant="success" size="lg" dot>Paid</Badge>
					</div>
				</Card>
			</section>

			<!-- Overlays -->
			<section id="overlays" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Dialogs, popovers &amp; tooltips</h2>
				<Card class="flex flex-wrap items-center gap-3 p-4 sm:p-6">
					<Dialog>
						<DialogTrigger as-child>
							<Button variant="outline" data-testid="open-dialog">Open dialog</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Close shift?</DialogTitle>
								<DialogDescription>
									Counted cash will be compared with expected amounts. You can review before
									submitting.
								</DialogDescription>
							</DialogHeader>
							<label class="space-y-1.5">
								<span class="text-sm font-medium">Counted cash</span>
								<NumberInput :model-value="45200" :precision="2" class="text-end" />
							</label>
							<DialogFooter>
								<Button variant="outline">Cancel</Button>
								<Button>Review closing</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					<Popover>
						<PopoverTrigger as-child>
							<Button variant="outline" data-testid="open-popover">Open popover</Button>
						</PopoverTrigger>
						<PopoverContentStyled>
							<p class="text-sm font-semibold">Stores - KL</p>
							<p class="mt-1 text-sm text-muted-foreground">POS Profile: Main Counter</p>
						</PopoverContentStyled>
					</Popover>
					<TooltipWrapper content="Hold sale (F6)" side="top">
						<Button variant="secondary">Hover for tooltip</Button>
					</TooltipWrapper>
				</Card>
			</section>

			<!-- Data -->
			<section id="data" class="scroll-mt-32 space-y-4">
				<h2 class="text-xl font-bold tracking-tight">Table &amp; states</h2>
				<div class="h-72">
					<Table
						v-model:rows="tableRows"
						:columns="tableColumns"
						label="Items"
						min-width="560px"
						class="h-full"
						:show-column-settings="false"
					/>
				</div>
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<Card class="min-h-48"
						><Table
							:rows="[]"
							:columns="tableColumns"
							label="Empty table"
							min-width="0"
							:show-column-settings="false"
							class="h-full border-0 shadow-none"
					/></Card>
					<Card
						><EmptyState
							:icon="PackageSearch"
							title="No items found"
							description="Try a different search or barcode."
							compact
							><Button variant="outline" size="sm">Clear search</Button></EmptyState
						></Card
					>
					<Card class="p-4"
						><LoadingState variant="skeleton" :rows="3" /><LoadingState compact
					/></Card>
					<Card
						><ErrorState
							compact
							retryable
							:retrying="retrying"
							description="Could not load stock levels."
							@retry="retry"
					/></Card>
				</div>
			</section>
		</main>
	</div>
</template>
