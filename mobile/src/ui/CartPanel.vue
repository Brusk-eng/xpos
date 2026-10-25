<script setup lang="ts">
import { Minus, Package, Plus, ShoppingCart, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { formatMinor, lineTotalMinor } from "@mobile/domain/money";
import { useCart } from "@mobile/composables/useCart";
import { useCheckout } from "@mobile/composables/useCheckout";
import { useApp } from "@mobile/composables/useApp";
import { ref, watch } from "vue";
import ShiftSheet from "./ShiftSheet.vue";
import { toastOn } from "@mobile/composables/useToast";

const props = defineProps<{ compact?: boolean; scopeId: string; currency: string; minorDigits: number }>();
const { cart, total, count, change, remove, clear } = useCart({
	code: props.currency,
	minorDigits: props.minorDigits,
});
const { state } = useApp();
const { flow, blocker, begin } = useCheckout();
toastOn(() => cart.error);
toastOn(() => flow.error, "warning");
const shiftOpen = ref(false);

watch(
	() => state.sessionExpired,
	(expired) => {
		if (!expired) flow.error = "";
	},
);

const money = (m: number) => formatMinor(m, props.minorDigits);
</script>

<template>
	<section class="flex h-full min-h-0 flex-col" aria-label="Cart">
		<div class="shrink-0 space-y-2 px-4 pt-3 pb-2">
			<div class="flex items-center justify-between gap-2">
				<h2 class="flex shrink-0 items-center gap-2 text-lg font-bold text-foreground">
					<ShoppingCart class="size-5 shrink-0 text-primary" aria-hidden="true" />
					<span>Sale</span>
				</h2>
				<div class="flex items-center gap-2">
					<span
						class="shrink-0 rounded-lg border border-border bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums"
						>{{ count }} units · {{ cart.lines.length }} products</span
					>
					<Button
						v-if="cart.lines.length"
						variant="ghost"
						size="icon"
						class="size-11"
						aria-label="Clear cart"
						@click="clear"
						><Trash2
					/></Button>
				</div>
			</div>
		</div>

		<ul
			v-if="cart.lines.length"
			class="xpos-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-2"
			aria-label="Cart lines"
		>
			<li
				v-for="l in cart.lines"
				:key="l.itemCode"
				class="rounded-2xl border border-border bg-surface-raised px-3 shadow-raised"
				:class="compact ? 'py-1.5' : 'py-2.5'"
			>
				<div class="flex gap-3">
					<div
						v-if="!compact"
						class="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card"
					>
						<Package class="size-5 text-muted-foreground/60" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-start gap-3">
							<div class="min-w-0 flex-1">
								<p
									class="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-foreground"
								>
									{{ l.name }}
								</p>
								<p class="mt-0.5 truncate font-mono text-xs text-muted-foreground">
									{{ l.itemCode }}
								</p>
							</div>
							<span class="shrink-0 text-base font-bold text-foreground tabular-nums">{{
								money(lineTotalMinor(l.priceMinor, l.qtyMilli))
							}}</span>
						</div>
						<div class="mt-2 flex items-center gap-2">
							<p
								class="min-w-0 flex-1 truncate text-sm font-semibold text-foreground tabular-nums"
							>
								{{ money(l.priceMinor) }}
							</p>
							<div
								class="flex shrink-0 items-center rounded-xl border border-border bg-card shadow-inset"
								role="group"
								:aria-label="`Quantity for ${l.name}`"
							>
								<button
									type="button"
									class="flex size-11 items-center justify-center rounded-s-xl text-foreground transition-colors duration-fast hover:bg-surface-hover active:bg-surface-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
									:aria-label="`Decrease ${l.name}`"
									@click="change(l.itemCode, -1)"
								>
									<Minus class="size-4" />
								</button>
								<span
									class="flex h-11 min-w-12 items-center justify-center border-x border-border text-center text-base font-semibold text-foreground tabular-nums"
									aria-live="polite"
									>{{ l.qtyMilli / 1000 }}</span
								>
								<button
									type="button"
									class="flex size-11 items-center justify-center rounded-e-xl text-primary transition-colors duration-fast hover:bg-surface-hover active:bg-surface-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
									:aria-label="`Increase ${l.name}`"
									@click="change(l.itemCode, 1)"
								>
									<Plus class="size-4" />
								</button>
							</div>
							<Button
								variant="ghost"
								size="icon"
								class="size-11 text-muted-foreground"
								:aria-label="`Remove ${l.name}`"
								@click="remove(l.itemCode)"
								><Trash2
							/></Button>
						</div>
					</div>
				</div>
			</li>
		</ul>
		<p v-else class="flex-1 px-4 py-8 text-center text-sm text-muted-foreground">
			The cart is empty. Tap an item to add it.
		</p>

		<div class="shrink-0 space-y-2.5 border-t border-border px-4 pt-2.5 pb-3">
			<dl class="px-1 text-sm">
				<div class="flex items-baseline justify-between">
					<dt class="text-lg font-bold text-foreground">Total</dt>
					<dd class="text-2xl font-extrabold tracking-tight tabular-nums">
						{{ currency }} {{ money(total) }}
					</dd>
				</div>
			</dl>
			<Button
				v-if="cart.lines.length && !state.context.openShift && state.online"
				variant="outline"
				class="h-12 w-full rounded-xl text-base font-semibold"
				@click="shiftOpen = true"
				>Open shift to start selling</Button
			>
			<Button
				v-else
				class="h-12 w-full rounded-xl text-base font-semibold"
				:disabled="!!blocker()"
				:loading="flow.step === 'quoting'"
				@click="begin"
				>Charge {{ currency }} {{ money(total) }}</Button
			>
			<p v-if="cart.lines.length && blocker()" class="text-center text-xs text-muted-foreground">
				{{ blocker() }}
			</p>
			<ShiftSheet v-model="shiftOpen" />
		</div>
	</section>
</template>
