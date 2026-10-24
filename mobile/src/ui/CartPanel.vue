<script setup lang="ts">
import { Minus, Package, Plus, ShoppingCart, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { formatMinor, lineTotalMinor } from "@mobile/domain/money";
import { useCart } from "@mobile/composables/useCart";
import { getContainer } from "@mobile/composables/useApp";

// Mirrors the web POS cart: header (Cart.vue), row cards (CartItem.vue) and totals (CartSummary.vue).
const props = defineProps<{ compact?: boolean; scopeId: string; currency: string; minorDigits: number }>();
const { cart, total, count, change, remove, clear, saveSample, dismissReceipt } = useCart({
	code: props.currency,
	minorDigits: props.minorDigits,
});

const money = (m: number) => formatMinor(m, props.minorDigits);
const canWrite = async () => {
	const a = getContainer().auth as {
		canWrite?: () => Promise<boolean>;
		leaseStatus: () => Promise<{ status: string } | null>;
	};
	if (a.canWrite) return a.canWrite();
	const s = await a.leaseStatus();
	return s?.status === "valid";
};
</script>

<template>
	<section class="flex h-full min-h-0 flex-col" aria-label="Cart (prototype sale)">
		<div class="shrink-0 space-y-2 px-4 pt-3 pb-2">
			<div class="flex items-center justify-between gap-2">
				<h2 class="flex shrink-0 items-center gap-2 text-lg font-bold text-foreground">
					<ShoppingCart class="size-5 shrink-0 text-primary" aria-hidden="true" />
					<span>Sale</span>
					<span class="text-xs font-semibold text-muted-foreground">(sample)</span>
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

			<div
				v-if="cart.lastReceipt"
				class="rounded-xl border border-success/30 bg-success-soft px-3 py-2 text-xs text-success-soft-foreground"
				role="status"
			>
				<p class="text-sm font-semibold">Sample sale saved on this device.</p>
				<p class="tabular-nums">
					{{ cart.lastReceipt.currency }} {{ money(cart.lastReceipt.totalMinor) }} ·
					{{ cart.lastStatus === "duplicate" ? "already recorded (retry)" : "recorded" }}
				</p>
				<p class="mt-1">
					{{ cart.lastReceipt.notice }} Not synced. Not a verified payment. Not fiscalized.
				</p>
				<Button class="mt-2 h-11" variant="outline" @click="dismissReceipt">Dismiss</Button>
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
			<p
				v-if="cart.error"
				class="rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground"
				role="alert"
			>
				{{ cart.error }}
			</p>
			<dl class="px-1 text-sm">
				<div class="flex items-baseline justify-between">
					<dt class="text-lg font-bold text-foreground">Total</dt>
					<dd class="text-2xl font-extrabold tracking-tight tabular-nums">
						{{ currency }} {{ money(total) }}
					</dd>
				</div>
			</dl>
			<Button
				class="h-12 w-full rounded-xl text-base font-semibold"
				:disabled="!cart.lines.length"
				:loading="cart.saving"
				@click="saveSample(props.scopeId, canWrite)"
				>Save as SAMPLE sale</Button
			>
			<p class="text-center text-xs text-muted-foreground">
				No payment, invoice or stock posting happens in this prototype.
			</p>
		</div>
	</section>
</template>
