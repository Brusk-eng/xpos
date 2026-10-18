<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { AlertTriangle, RotateCw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { __, cn } from "@/lib/utils";

const props = withDefaults(
	defineProps<{
		title?: string;
		description?: string;
		retryLabel?: string;
		retrying?: boolean;
		/** Shows the built-in retry button; listen to `retry` or use the default slot for custom actions. */
		retryable?: boolean;
		compact?: boolean;
		class?: HTMLAttributes["class"];
	}>(),
	{ retryable: false, retrying: false, compact: false },
);

const emit = defineEmits<{ (e: "retry"): void }>();
</script>

<template>
	<div
		role="alert"
		:class="
			cn(
				'flex flex-col items-center justify-center text-center',
				compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
				props.class,
			)
		"
	>
		<div
			class="flex items-center justify-center rounded-full border border-destructive/30 bg-destructive-soft text-destructive-soft-foreground"
			:class="compact ? 'size-10' : 'size-14'"
			aria-hidden="true"
		>
			<AlertTriangle :class="compact ? 'size-5' : 'size-6'" />
		</div>
		<div class="space-y-1">
			<p class="text-sm font-semibold text-foreground">{{ title || __("Something went wrong") }}</p>
			<p v-if="description" class="max-w-sm text-sm text-muted-foreground">{{ description }}</p>
		</div>
		<div v-if="retryable || $slots.default" class="mt-1 flex flex-wrap items-center justify-center gap-2">
			<Button v-if="retryable" variant="outline" :loading="retrying" @click="emit('retry')">
				<RotateCw />
				{{ retryLabel || __("Try again") }}
			</Button>
			<slot />
		</div>
	</div>
</template>
