<script setup lang="ts">
import { cn } from "@/lib/utils";
import { inputVariants, type InputVariants } from ".";
import { useVModel } from "@vueuse/core";
import type { HTMLAttributes } from "vue";

const props = defineProps<{
	defaultValue?: string | number;
	modelValue?: string | number;
	class?: HTMLAttributes["class"];
	type?: string;
	size?: InputVariants["size"];
}>();

const emits = defineEmits<{
	(e: "update:modelValue", payload: string | number): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
	passive: true,
	defaultValue: props.defaultValue,
});

/** Block 'e', 'E', '+', '-' keys on numeric inputs to prevent scientific notation */
function onKeyDown(event: KeyboardEvent) {
	if (props.type === "number" && ["e", "E", "+", "-"].includes(event.key)) {
		event.preventDefault();
	}
}
</script>

<template>
	<input
		v-model="modelValue"
		autocomplete="new-password"
		:type="type"
		:class="cn(inputVariants({ size }), props.class)"
		@keydown="onKeyDown"
	/>
</template>
