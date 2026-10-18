<template>
	<Transition name="xpos-splash-fade">
		<div v-if="show" class="xpos-splash">
			<XposLogo :size="96" class="xpos-splash__logo" />
		</div>
	</Transition>
</template>

<script setup lang="ts">
import { XposLogo } from "@/components/ui/brand";

defineProps<{ show: boolean }>();
</script>

<style scoped>
.xpos-splash {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	background-color: hsl(var(--background));
}

.xpos-splash__logo {
	width: 96px;
	height: 96px;
	border-radius: 22%;
	animation: xpos-splash-pulse 1.6s ease-in-out infinite;
}

@keyframes xpos-splash-pulse {
	0%,
	100% {
		transform: scale(1);
		opacity: 0.92;
	}
	50% {
		transform: scale(1.06);
		opacity: 1;
	}
}

.xpos-splash-fade-leave-active {
	transition: opacity 0.35s ease;
}
.xpos-splash-fade-leave-to {
	opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
	.xpos-splash__logo {
		animation: none;
	}
}
</style>
