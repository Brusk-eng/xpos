<script setup lang="ts">
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "vue";
import { cardVariants, type CardVariants } from ".";
const props = defineProps<{ class?: HTMLAttributes["class"]; variant?: CardVariants["variant"] }>();
</script>
<template>
	<div :class="cn(cardVariants({ variant }), props.class)">
		<slot />
	</div>
</template>
