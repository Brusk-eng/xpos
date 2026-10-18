<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { Primitive, type PrimitiveProps } from "radix-vue";
import { computed, type HTMLAttributes } from "vue";
import { buttonVariants, type ButtonVariants } from ".";
import { cn } from "@/lib/utils";

interface Props extends PrimitiveProps {
	variant?: ButtonVariants["variant"];
	size?: ButtonVariants["size"];
	class?: HTMLAttributes["class"];
	/** Shows a spinner, sets aria-busy and blocks activation while keeping the label width. */
	loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	as: "button",
	loading: false,
});

const delegatedProps = computed(() => {
	const { class: _, loading: __, ...delegated } = props;
	return delegated;
});

const busyAttrs = computed(() =>
	props.loading
		? {
				"aria-busy": "true",
				"aria-disabled": "true",
				...(props.as === "button" && !props.asChild ? { disabled: true } : {}),
			}
		: {},
);

function onClickCapture(event: MouseEvent) {
	if (!props.loading) return;
	event.preventDefault();
	event.stopImmediatePropagation();
}
</script>

<template>
	<Primitive
		v-bind="{ ...delegatedProps, ...busyAttrs }"
		:class="cn(buttonVariants({ variant, size }), props.class)"
		@click.capture="onClickCapture"
	>
		<span v-if="loading" class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
			<Loader2 class="animate-spin" />
		</span>
		<span v-if="loading" class="contents invisible [&>*]:invisible">
			<slot />
		</span>
		<slot v-else />
	</Primitive>
</template>
