<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { Loader2 } from "lucide-vue-next";
import { Skeleton } from "@/components/ui/skeleton";
import { __, cn } from "@/lib/utils";

const props = withDefaults(
	defineProps<{
		label?: string;
		/** "spinner" for short waits, "skeleton" for content-shaped placeholders. */
		variant?: "spinner" | "skeleton";
		rows?: number;
		compact?: boolean;
		class?: HTMLAttributes["class"];
	}>(),
	{ variant: "spinner", rows: 3, compact: false },
);
</script>

<template>
	<div
		role="status"
		aria-live="polite"
		:class="
			cn(
				variant === 'spinner' &&
					'flex items-center justify-center gap-2.5 text-sm text-muted-foreground',
				variant === 'spinner' && (compact ? 'py-6' : 'py-12'),
				props.class,
			)
		"
	>
		<template v-if="variant === 'spinner'">
			<Loader2 class="size-5 animate-spin text-primary" aria-hidden="true" />
			<span>{{ label || __("Loading...") }}</span>
		</template>
		<template v-else>
			<span class="sr-only">{{ label || __("Loading...") }}</span>
			<div class="space-y-2.5" aria-hidden="true">
				<Skeleton
					v-for="i in rows"
					:key="i"
					class="h-10"
					:style="{ width: `${100 - ((i - 1) % 3) * 12}%` }"
				/>
			</div>
		</template>
	</div>
</template>
