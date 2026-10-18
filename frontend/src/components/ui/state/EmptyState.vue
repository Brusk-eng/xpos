<script setup lang="ts">
import type { Component, HTMLAttributes } from "vue";
import { Inbox } from "lucide-vue-next";
import { cn } from "@/lib/utils";

const props = withDefaults(
	defineProps<{
		title: string;
		description?: string;
		icon?: Component;
		compact?: boolean;
		class?: HTMLAttributes["class"];
	}>(),
	{ icon: () => Inbox, compact: false },
);
</script>

<template>
	<div
		:class="
			cn(
				'flex flex-col items-center justify-center text-center',
				compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
				props.class,
			)
		"
	>
		<div
			class="flex items-center justify-center rounded-full border border-border bg-surface-sunken text-muted-foreground shadow-inset"
			:class="compact ? 'size-10' : 'size-14'"
			aria-hidden="true"
		>
			<slot name="icon">
				<component :is="icon" :class="compact ? 'size-5' : 'size-6'" />
			</slot>
		</div>
		<div class="space-y-1">
			<p class="text-sm font-semibold text-foreground">{{ title }}</p>
			<p v-if="description" class="max-w-sm text-sm text-muted-foreground">{{ description }}</p>
		</div>
		<div v-if="$slots.default" class="mt-1 flex flex-wrap items-center justify-center gap-2">
			<slot />
		</div>
	</div>
</template>
