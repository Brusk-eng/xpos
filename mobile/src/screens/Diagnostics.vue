<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogScopeInfo, CatalogStats, PrinterCapabilities, ScannerCapabilities } from "@mobile/ports";
import { isCleartext } from "@mobile/domain/origin";
import { fingerprintOf } from "@mobile/db/model";
import { ALL_MODELS } from "@mobile/db/models";
import { ALL_STEPS } from "@mobile/db/steps";
import {
	getContainer,
	getLifecycle,
	lock,
	refreshCatalog,
	signOut,
	useApp,
} from "@mobile/composables/useApp";

const { state } = useApp();
const fingerprint = fingerprintOf(
	ALL_MODELS,
	ALL_STEPS.map((x) => x.id),
);
const c = getContainer();
const scopes = ref<(CatalogScopeInfo & { stats: CatalogStats })[]>([]);
const lease = ref<{ status: string; remainingMs: number } | null>(null);
const outbox = ref<Record<string, number>>({});
const sync = ref({ supported: false, reason: "", pending: 0 });
const storage = ref("unknown");
const scanners = ref<ScannerCapabilities[]>([]);
const printers = ref<PrinterCapabilities[]>([]);

async function refresh() {
	const list = await c.catalog.listScopes();
	scopes.value = await Promise.all(
		list.map(async (s) => ({ ...s, stats: await c.catalog.stats(s.scopeId) })),
	);
	lease.value = await c.auth.leaseStatus();
	outbox.value = await c.transactions.outboxCounts();
	sync.value = await c.sync.status();
	scanners.value = c.scanner.capabilities();
	printers.value = c.printer.capabilities();
	try {
		const e = await navigator.storage?.estimate?.();
		if (e?.usage !== undefined)
			storage.value = `${(e.usage / 2 ** 20).toFixed(1)} MiB used${e.quota ? ` of ${(e.quota / 2 ** 20).toFixed(0)} MiB` : ""} (browser/WebView estimate)`;
	} catch {
		/* unavailable */
	}
}
onMounted(refresh);
const hours = (ms: number) => `${(ms / 3_600_000).toFixed(1)} h`;
</script>

<template>
	<div class="pad-safe-x mx-auto flex max-w-3xl flex-col gap-4 py-4">
		<h1 class="text-xl font-bold">Device &amp; storage diagnostics</h1>

		<section class="rounded-2xl border border-border bg-card p-4 shadow-raised" aria-labelledby="d-impl">
			<h2 id="d-impl" class="mb-2 font-semibold">Implementation in use</h2>
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt class="text-muted-foreground">Catalog store</dt>
				<dd>{{ c.catalog.kind }}</dd>
				<dt class="text-muted-foreground">Transactions</dt>
				<dd>{{ c.transactions.kind }}</dd>
				<dt class="text-muted-foreground">Schema</dt>
				<dd>{{ ALL_MODELS.length }} tables, checked at startup ({{ fingerprint }})</dd>
				<dt class="text-muted-foreground">Server</dt>
				<dd class="break-all">
					{{ state.cashier?.site ?? state.origin ?? "n/a"
					}}{{ isCleartext(state.cashier?.site ?? state.origin) ? " (not encrypted)" : "" }}
				</dd>
				<dt class="text-muted-foreground">Cashier</dt>
				<dd>{{ state.cashier?.user ?? "n/a" }}</dd>
				<dt class="text-muted-foreground">Connectivity</dt>
				<dd>{{ getLifecycle().isOnline() ? "online" : "offline" }}</dd>
				<dt class="text-muted-foreground">Storage</dt>
				<dd>{{ storage }}</dd>
				<dt class="text-muted-foreground">Application ID</dt>
				<dd>com.kodlyft.xpos.mobile.dev (provisional; finalize before Play)</dd>
			</dl>
		</section>

		<section class="rounded-2xl border border-border bg-card p-4 shadow-raised" aria-labelledby="d-lease">
			<h2 id="d-lease" class="mb-2 font-semibold">Offline authorization</h2>
			<p v-if="lease" class="text-sm">
				<Badge :variant="lease.status === 'valid' ? 'success' : 'destructive'">{{
					lease.status
				}}</Badge>
				{{ hours(lease.remainingMs) }} remaining. New sales
				{{ lease.status === "valid" ? "are allowed" : "are blocked; queued data is kept" }}.
			</p>
			<p v-else class="text-sm text-muted-foreground">No lease (not enrolled).</p>
			<p class="mt-2 text-xs text-muted-foreground">
				Local unlock never renews ERPNext authorization; permissions are re-checked by the server
				before anything is posted.
			</p>
		</section>

		<section class="rounded-2xl border border-border bg-card p-4 shadow-raised" aria-labelledby="d-cat">
			<h2 id="d-cat" class="mb-2 font-semibold">Catalog</h2>
			<p class="mb-2 text-sm" role="status">
				<template v-if="state.catalog.syncing"
					>Downloading: {{ state.catalog.downloaded.toLocaleString() }} of
					{{ state.catalog.total.toLocaleString() }} items</template
				>
				<template v-else-if="state.catalog.syncedAt"
					>Last downloaded {{ new Date(state.catalog.syncedAt).toLocaleString() }}</template
				>
				<template v-else>Not downloaded in this session</template>
				<template v-if="state.catalog.skippedBarcodes">
					· {{ state.catalog.skippedBarcodes }} barcodes skipped (sold in a unit the app cannot
					price yet)</template
				>
			</p>
			<p v-if="state.catalog.message" class="mb-2 text-sm text-warning-soft-foreground">
				{{ state.catalog.message }}
			</p>
			<Button
				variant="outline"
				class="mb-3 h-11"
				:loading="state.catalog.syncing"
				@click="refreshCatalog"
				>Refresh catalog now</Button
			>
			<ul class="flex flex-col gap-2 text-sm">
				<li v-for="s in scopes" :key="s.scopeId" class="rounded-md border border-border p-2">
					<p class="font-medium">
						{{ s.scopeId }}
					</p>
					<p class="text-muted-foreground">
						{{ s.stats.items.toLocaleString() }} items ·
						{{ s.stats.barcodes.toLocaleString() }} barcodes · generation
						{{ s.activeGen ?? "none" }} · {{ s.currency }} ({{ s.minorDigits }} minor digits)
					</p>
				</li>
				<li v-if="!scopes.length" class="text-muted-foreground">No scopes yet.</li>
			</ul>
		</section>

		<section class="rounded-2xl border border-border bg-card p-4 shadow-raised" aria-labelledby="d-queue">
			<h2 id="d-queue" class="mb-2 font-semibold">Outbox &amp; synchronization</h2>
			<p class="text-sm">
				Queued commands:
				{{
					Object.entries(outbox)
						.map(([k, v]) => `${v} ${k}`)
						.join(", ") || "none"
				}}
			</p>
			<p class="text-sm"><Badge variant="neutral">Sync not implemented</Badge> {{ sync.reason }}</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Sample commands are blocked in the database and can never be posted to ERPNext.
			</p>
		</section>

		<section class="rounded-2xl border border-border bg-card p-4 shadow-raised" aria-labelledby="d-hw">
			<h2 id="d-hw" class="mb-2 font-semibold">Scanners &amp; printers (capability report)</h2>
			<ul class="flex flex-col gap-2 text-sm">
				<li v-for="s in scanners" :key="s.kind">
					<strong>Scanner · {{ s.kind }}</strong
					>: {{ s.supported ? "available" : "unsupported" }},
					{{ s.tested ? "tested" : "not tested on hardware" }}. {{ s.note }}
				</li>
				<li v-for="p in printers" :key="p.kind">
					<strong>Printer · {{ p.kind }}</strong
					>: {{ p.supported ? "available" : "unsupported" }},
					{{ p.tested ? "tested" : "not tested on hardware" }}. {{ p.note }}
				</li>
			</ul>
			<p class="mt-2 text-xs text-muted-foreground">
				Evaluation candidates (untested): Samsung Galaxy A26 5G, Epson TM-P20II (Bluetooth), Zebra
				DS2278, SUNMI V3 PLUS (Google Play availability varies by configuration).
			</p>
		</section>

		<div class="flex flex-wrap gap-2">
			<Button variant="outline" @click="refresh">Refresh</Button>
			<Button variant="outline" @click="lock('Locked from diagnostics')">Lock now</Button>
			<Button variant="destructive" @click="signOut">Sign out</Button>
		</div>
	</div>
</template>
