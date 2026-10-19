<template>
	<SelectItem
		v-bind="$attrs"
		:class="
			cn(
				'relative flex min-h-10 w-full cursor-default select-none items-center rounded-xl py-1.5 ps-3 pe-8 text-sm outline-none focus:bg-surface-hover data-highlighted:bg-surface-hover data-[state=checked]:bg-surface-selected data-[state=checked]:font-semibold data-[state=checked]:text-surface-selected-foreground data-disabled:pointer-events-none data-disabled:opacity-55',
				$attrs.class as string,
			)
		"
		:value="value"
	>
		<span class="absolute inset-e-2 flex h-4 w-4 items-center justify-center">
			<SelectItemIndicator>
				<Check class="h-4 w-4" />
			</SelectItemIndicator>
		</span>
		<SelectItemText>
			<slot />
		</SelectItemText>
	</SelectItem>
</template>

<script setup lang="ts">
import { SelectItem, SelectItemIndicator, SelectItemText } from "radix-vue";
import { Check } from "lucide-vue-next";
import { cn } from "@/lib/utils";

defineOptions({
	inheritAttrs: false,
});

defineProps<{
	value: string;
}>();
</script>
