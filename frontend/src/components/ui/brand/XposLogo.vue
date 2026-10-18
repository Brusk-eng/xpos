<script setup lang="ts">
import { computed, useId, type HTMLAttributes } from "vue";
import { __, cn } from "@/lib/utils";
import { BACK, FORWARD, SMALL_BACK, SMALL_FORWARD, TILE } from "./logoPaths";

const props = withDefaults(
	defineProps<{
		/** "mark" is the tile only; "full" adds the XPOS wordmark. */
		variant?: "mark" | "full";
		/** Tile edge length in px. */
		size?: number;
		/** Optional line under the wordmark, e.g. the company name. */
		subtitle?: string;
		/** Optional release tag after the wordmark, e.g. "v3". */
		version?: string;
		class?: HTMLAttributes["class"];
	}>(),
	{ variant: "mark", size: 32 },
);

// Unique per instance: a hidden copy (e.g. the responsive full/mark pair) must not own the gradient.
const gradientId = `xpos-tile-${useId()}`;
/** At 20 px and below the interlace gap would blur, so the solid, heavier X is drawn. */
const small = computed(() => props.size <= 20);
const wordmarkSize = computed(() => `${Math.max(14, Math.round(props.size * 0.5))}px`);
</script>

<template>
	<span
		:class="cn('inline-flex items-center text-foreground', props.class)"
		:style="{ gap: `${Math.max(6, Math.round(size * 0.28))}px` }"
		role="img"
		:aria-label="subtitle ? `${__('XPOS')} - ${subtitle}` : __('XPOS')"
	>
		<svg
			:width="size"
			:height="size"
			viewBox="0 0 128 128"
			class="xpos-mark shrink-0"
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" class="xpos-mark__top" />
					<stop offset="1" class="xpos-mark__bottom" />
				</linearGradient>
			</defs>
			<path :d="TILE" :fill="`url(#${gradientId})`" />
			<path :d="TILE" class="xpos-mark__edge" fill="none" stroke-width="2" />
			<template v-if="small">
				<path :d="SMALL_BACK" fill="#fff" />
				<path :d="SMALL_FORWARD" fill="#fff" />
			</template>
			<template v-else>
				<path :d="FORWARD" fill="#C7D7FE" />
				<path :d="BACK" fill="#fff" />
			</template>
		</svg>
		<span v-if="variant === 'full'" class="flex min-w-0 flex-col leading-none" aria-hidden="true">
			<span class="flex items-center gap-1.5">
				<span class="font-bold tracking-[-0.01em]" :style="{ fontSize: wordmarkSize }">XPOS</span>
				<span
					v-if="version"
					class="rounded-[0.3125rem] border border-border px-1 py-px text-[0.6875rem] font-semibold leading-tight text-muted-foreground"
					>{{ version }}</span
				>
			</span>
			<span v-if="subtitle" class="mt-1 truncate text-xs font-medium text-muted-foreground">
				{{ subtitle }}
			</span>
		</span>
	</span>
</template>

<style scoped>
.xpos-mark__top {
	stop-color: #2563eb;
}
.xpos-mark__bottom {
	stop-color: #1d4ed8;
}
.xpos-mark__edge {
	stroke: transparent;
}
:global(.dark) .xpos-mark__top {
	stop-color: #4a7cf2;
}
:global(.dark) .xpos-mark__bottom {
	stop-color: #2f5fe0;
}
:global(.dark) .xpos-mark__edge {
	stroke: rgb(255 255 255 / 0.1);
}
</style>
