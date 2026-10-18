<template>
	<PopoverPortal>
		<PopoverContent
			v-bind="{ ...$attrs, ...props }"
			:collision-padding="12"
			:class="
				cn(
					'z-50 w-72 max-w-[calc(100vw-1rem)] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-overlay outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',
					$attrs.class as string,
				)
			"
		>
			<slot />
		</PopoverContent>
	</PopoverPortal>
</template>

<script setup lang="ts">
import { PopoverContent, PopoverPortal, type PopoverContentProps } from "radix-vue";
import { cn } from "@/lib/utils";

defineOptions({
	inheritAttrs: false,
});

const props = withDefaults(defineProps<PopoverContentProps>(), {
	sideOffset: 4,
	align: "center",
});
</script>
