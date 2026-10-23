<script setup lang="ts">
import { usePosStore } from "@/stores/posStore";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import StockReceiving from "@/components/purchase/StockReceiving.vue";
import { PackageCheck } from "lucide-vue-next";
import __ from "@/lib/translate";

const posStore = usePosStore();
</script>

<template>
	<div class="h-full flex flex-col bg-background overflow-hidden">
		<PageHeader :title="__('Stock Receiving')" :icon="PackageCheck">
			<Badge variant="secondary" class="gap-1.5">{{ posStore.warehouse }}</Badge>
			<Badge variant="outline">{{ posStore.companyName }}</Badge>
		</PageHeader>
		<div class="flex-1 min-h-0 overflow-hidden">
			<StockReceiving />
		</div>
	</div>
</template>
