<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

const props = defineProps<{ class?: HTMLAttributes["class"] }>();
</script>

<template>
	<div :class="cn('xpos-skeleton', props.class)" aria-hidden="true" />
</template>
