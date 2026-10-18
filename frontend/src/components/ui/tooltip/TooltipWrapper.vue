<script setup lang="ts">
import { computed } from "vue";
import { TooltipProvider, TooltipTrigger } from "radix-vue";
import Tooltip from "./Tooltip.vue";
import TooltipContent from "./TooltipContent.vue";

const props = withDefaults(
	defineProps<{
		content: string | number;
		/** Keyboard shortcut chip, e.g. "Ctrl+G". A trailing "(Ctrl+G)" in content is detected too. */
		shortcut?: string;
		side?: "top" | "right" | "bottom" | "left";
		delayDuration?: number;
		skipDelayDuration?: number;
	}>(),
	{
		side: "bottom",
		delayDuration: 200,
		skipDelayDuration: 100,
	},
);

const SHORTCUT_SUFFIX = /^(.*\S)\s*\(((?:Ctrl|Alt|Shift|Cmd|Esc|Enter|F\d{1,2}|\/)[^()]*)\)$/;

const parts = computed(() => {
	const text = String(props.content ?? "");
	if (props.shortcut) return { label: text, keys: props.shortcut.split("+") };
	const match = text.match(SHORTCUT_SUFFIX);
	return match ? { label: match[1], keys: match[2].split("+") } : { label: text, keys: [] };
});
</script>

<template>
	<TooltipProvider :delay-duration="delayDuration" :skip-delay-duration="skipDelayDuration">
		<Tooltip>
			<TooltipTrigger as-child>
				<slot />
			</TooltipTrigger>
			<TooltipContent :side="side">
				<span>{{ parts.label }}</span>
				<span v-if="parts.keys.length" class="inline-flex items-center gap-1">
					<kbd
						v-for="key in parts.keys"
						:key="key"
						class="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-surface-sunken px-1.5 font-mono text-xs font-semibold text-muted-foreground"
						>{{ key }}</kbd
					>
				</span>
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
</template>
