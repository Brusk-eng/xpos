<script setup lang="ts">
import { CheckboxRoot, CheckboxIndicator, type CheckboxRootProps } from "radix-vue";
import { Check, Minus } from "lucide-vue-next";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "vue";

interface Props extends CheckboxRootProps {
	class?: HTMLAttributes["class"];
	indeterminate?: boolean;
}

const props = defineProps<Props>();
const emits = defineEmits<{
	"update:checked": [value: boolean | "indeterminate"];
}>();
</script>

<template>
	<CheckboxRoot
		v-bind="props"
		:class="
			cn(
				'peer size-4.5 shrink-0 rounded-[5px] border border-border-strong bg-surface-raised shadow-raised',
				'transition-[background-color,border-color] duration-fast hover:border-primary',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background',
				'aria-[invalid=true]:border-destructive',
				'disabled:cursor-not-allowed disabled:opacity-55',
				'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
				'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
				props.class,
			)
		"
		@update:checked="emits('update:checked', $event)"
	>
		<CheckboxIndicator class="flex h-full w-full items-center justify-center text-current">
			<Minus v-if="indeterminate" class="h-3.5 w-3.5" stroke-width="3" />
			<Check v-else class="h-3.5 w-3.5" stroke-width="3" />
		</CheckboxIndicator>
	</CheckboxRoot>
</template>
