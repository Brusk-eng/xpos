<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { badgeVariants, type BadgeVariants } from ".";
import { cn } from "@/lib/utils";

const props = defineProps<{
	variant?: BadgeVariants["variant"];
	size?: BadgeVariants["size"];
	/** Leading status dot; pairs colour with a shape so state is not conveyed by colour alone. */
	dot?: boolean;
	class?: HTMLAttributes["class"];
}>();
</script>

<template>
	<div :class="cn(badgeVariants({ variant, size }), props.class)">
		<span v-if="dot" class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
		<slot />
	</div>
</template>
