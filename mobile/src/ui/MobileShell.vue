<script setup lang="ts">
import PrototypeBanner from "./PrototypeBanner.vue";
</script>

<template>
	<div class="flex h-full min-h-0 flex-col bg-background text-foreground">
		<PrototypeBanner />
		<slot name="header" />
		<main class="xpos-scrollbar min-h-0 flex-1 overflow-y-auto"><slot /></main>
		<nav v-if="$slots.nav" class="pad-safe-x pad-safe-bottom shrink-0 pt-1" aria-label="Main">
			<slot name="nav" />
		</nav>
	</div>
</template>
