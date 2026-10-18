<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{
	/** Keyboard shortcut shown at the end, e.g. "Ctrl+K". */
	shortcut?: string;
	destructive?: boolean;
	disabled?: boolean;
	class?: HTMLAttributes["class"];
}>();

defineEmits<{ (e: "click", event: MouseEvent): void }>();
</script>

<template>
	<button
		type="button"
		role="menuitem"
		:disabled="disabled"
		:class="
			cn(
				'flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4.5 [&_svg]:shrink-0',
				destructive
					? 'text-destructive-soft-foreground hover:bg-destructive-soft [&_svg]:text-destructive-soft-foreground'
					: 'text-foreground hover:bg-surface-hover [&_svg]:text-muted-foreground',
				props.class,
			)
		"
		@click="$emit('click', $event)"
	>
		<slot name="icon" />
		<span class="min-w-0 flex-1 truncate"><slot /></span>
		<span v-if="shortcut" class="inline-flex items-center gap-1">
			<kbd
				v-for="key in shortcut.split('+')"
				:key="key"
				class="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-surface-sunken px-1.5 font-mono text-xs font-semibold text-muted-foreground"
				>{{ key }}</kbd
			>
		</span>
	</button>
</template>
