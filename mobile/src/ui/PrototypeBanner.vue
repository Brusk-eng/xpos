<script setup lang="ts">
import { Info } from "@lucide/vue";
</script>

<template>
	<div class="pad-safe-top shrink-0">
		<div class="pad-safe-x pt-2" role="note">
			<div
				class="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning-soft-foreground"
			>
				<Info class="size-3.5 shrink-0" aria-hidden="true" />
				<span
					>Foundation build: sales are saved on this device only and are not posted to
					ERPNext.</span
				>
			</div>
		</div>
	</div>
</template>
