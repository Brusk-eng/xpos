<script setup lang="ts">
import { cn } from "@/lib/utils";
import { TooltipContent, type TooltipContentProps, TooltipPortal } from "radix-vue";
import { computed, type HTMLAttributes } from "vue";

const props = withDefaults(defineProps<TooltipContentProps & { class?: HTMLAttributes["class"] }>(), {
	sideOffset: 6,
});

const delegatedProps = computed(() => {
	const { class: _, ...delegated } = props;
	return delegated;
});
</script>

<template>
	<TooltipPortal>
		<TooltipContent
			v-bind="delegatedProps"
			:class="
				cn(
					// Raised Pearl surface matching popovers
					'z-50 inline-flex max-w-xs items-center gap-2 rounded-xl select-none',
					'border border-border bg-popover px-3 py-2 text-sm font-medium leading-snug text-popover-foreground',
					'shadow-overlay',
					// Short fade + 1-step slide; reduced motion drops it globally
					'animate-in fade-in-0 duration-150 ease-out',
					'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100',
					'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
					props.class,
				)
			"
		>
			<slot />
		</TooltipContent>
	</TooltipPortal>
</template>
