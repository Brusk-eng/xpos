<template>
	<div
		class="fixed inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/95 z-50 flex flex-col items-center overflow-y-auto p-4"
	>
		<div class="w-full max-w-md animate-in fade-in zoom-in-95 duration-300 my-auto">
			<div class="text-center mb-8">
				<div
					class="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg"
				>
					<Zap class="w-8 h-8 text-primary-foreground" />
				</div>
				<h1 class="text-2xl font-bold text-primary-foreground mb-1">X POS</h1>
				<p class="text-primary-foreground/70 text-sm">Open your shift to get started</p>
			</div>

			<Card>
				<CardContent class="p-6 space-y-5">
					<div v-if="isLoadingData" class="flex items-center justify-center py-8">
						<Loader2 class="w-8 h-8 text-primary animate-spin" />
					</div>

					<template v-else>
						<div class="flex items-center justify-between">
							<label class="text-sm font-semibold text-foreground">POS Profile</label>
							<TooltipWrapper
								:content="syncStatus.isSyncing.value ? 'Syncing...' : 'Refresh profiles'"
							>
								<button
									type="button"
									class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
									:class="{
										'animate-spin pointer-events-none': syncStatus.isSyncing.value,
									}"
									:disabled="isLoadingData"
									@click="loadProfiles"
								>
									<RefreshCw class="w-3.5 h-3.5" />
									<span>{{ syncStatus.isSyncing.value ? "Syncing..." : "Refresh" }}</span>
								</button>
							</TooltipWrapper>
						</div>

						<div>
							<select
								v-model="selectedProfile"
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
								@change="onProfileChange"
							>
								<option value="" disabled>Select POS Profile</option>
								<option v-for="profile in profiles" :key="profile.name" :value="profile.name">
									{{ profile.name }} ({{ profile.company }})
								</option>
							</select>
							<p v-if="profiles.length === 0" class="mt-1 text-xs text-muted-foreground">
								{{
									syncStatus.isSyncing.value
										? "Downloading profiles from server…"
										: "No profiles found. Check server connection or click Refresh."
								}}
							</p>
						</div>

						<div v-if="selectedCompany">
							<label class="text-sm font-semibold text-foreground mb-1.5 block">Company</label>
							<div
								class="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
							>
								{{ selectedCompany }}
							</div>
						</div>

						<div v-if="paymentMethodsList.length > 0">
							<label class="text-sm font-semibold text-foreground mb-2 block"
								>Opening Cash Balance</label
							>
							<div class="space-y-2">
								<div
									v-for="method in paymentMethodsList"
									:key="method.mode_of_payment"
									class="flex items-center gap-3"
								>
									<span class="text-sm text-muted-foreground w-28 truncate">{{
										method.mode_of_payment
									}}</span>
									<NumberInput
										v-model="method.opening_amount"
										:min="0"
										:precision="2"
										class="flex-1"
										placeholder="0.00"
									/>
								</div>
							</div>
						</div>

						<Button
							size="xl"
							class="w-full font-bold bg-gradient-to-r from-primary to-primary/90"
							:disabled="!selectedProfile || isOpening"
							@click="handleOpenShift"
						>
							<template v-if="isOpening">
								<Loader2 class="w-5 h-5 animate-spin" />
								Opening Shift...
							</template>
							<template v-else>
								<Lock class="w-5 h-5" />
								Open Shift
							</template>
						</Button>
					</template>
				</CardContent>
			</Card>

			<div v-if="!isElectronMode" class="text-center mt-4">
				<a
					href="/app"
					class="text-primary-foreground/60 hover:text-primary-foreground text-sm transition-colors no-underline"
				>
					← Back to Desk
				</a>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { usePosStore } from "@/stores/posStore";
import { showError } from "@/services/api";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { Card, CardContent } from "@/components/ui/card";
import { TooltipWrapper } from "@/components/ui/tooltip";
import { Zap, Loader2, Lock, RefreshCw } from "lucide-vue-next";
import { useSyncStatus } from "@/composables/useSyncStatus";
import { isElectron } from "@/services/electronBridge";

const isElectronMode = isElectron();

interface ProfileOption {
	name: string;
	company: string;
	[key: string]: unknown;
}

interface PaymentMethodEntry {
	mode_of_payment: string;
	opening_amount: number;
	parent?: string;
	[key: string]: unknown;
}

const posStore = usePosStore();
const syncStatus = useSyncStatus();

const isLoadingData = ref(true);
const isOpening = ref(false);
const profiles = ref<ProfileOption[]>([]);
const selectedProfile = ref("");
const selectedCompany = ref("");
const paymentMethodsList = ref<PaymentMethodEntry[]>([]);

async function loadProfiles() {
	isLoadingData.value = true;
	try {
		const data = await posStore.fetchOpeningData();
		profiles.value = (data?.pos_profiles || []) as ProfileOption[];

		if (profiles.value.length === 1) {
			selectedProfile.value = profiles.value[0].name;
			onProfileChange();
		}
	} catch (error) {
		showError("Failed to load POS data. Please refresh.");
	} finally {
		isLoadingData.value = false;
	}
}

onMounted(loadProfiles);

watch(syncStatus.syncCompleteCount, (count, prev) => {
	if (count > prev) {
		loadProfiles();
	}
});

function onProfileChange() {
	const profile = profiles.value.find((p) => p.name === selectedProfile.value);
	if (profile) {
		selectedCompany.value = profile.company;

		const openingData = posStore.openingData as Record<string, unknown> | null;
		const methods = ((openingData?.payment_methods || []) as PaymentMethodEntry[]).filter(
			(m) => m.parent === selectedProfile.value,
		);
		paymentMethodsList.value = methods.map((m) => ({
			mode_of_payment: m.mode_of_payment,
			opening_amount: 0,
		}));

		if (paymentMethodsList.value.length === 0) {
			paymentMethodsList.value = [{ mode_of_payment: "Cash", opening_amount: 0 }];
		}
	}
}

async function handleOpenShift() {
	if (!selectedProfile.value || isOpening.value) return;
	isOpening.value = true;

	try {
		await posStore.openShift(
			selectedProfile.value,
			selectedCompany.value,
			paymentMethodsList.value.map((m) => ({
				mode_of_payment: m.mode_of_payment,
				opening_amount: m.opening_amount || 0,
			})),
		);
	} catch (error: unknown) {
		showError("Failed to open shift: " + ((error as Error)?.message || error));
	} finally {
		isOpening.value = false;
	}
}
</script>
