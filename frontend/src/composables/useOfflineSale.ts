import { ref } from "vue";
import { useCartStore } from "@/stores/cartStore";
import { useOfflineStore, type SaveOfflineResult } from "@/stores/offlineStore";
import { usePosStore } from "@/stores/posStore";
import { usePrintInvoice } from "@/composables/usePrintInvoice";
import { showInfo } from "@/services/api";
import type { InvoiceData } from "@/types/pos.types";
import { __ } from "@/lib/translate";

/** The number a sale carries on its receipt until it reaches the server. */
export function offlineReceiptName(localId: number): string {
	return `OFFLINE-${localId}`;
}

export function saveFailureMessage(result: Pick<SaveOfflineResult, "reason" | "blockers">): string {
	if (result.blockers?.length) {
		const reasons = result.blockers.map((blocker) => blocker.message).join("\n");
		return result.reason === "held"
			? `${__(
					"The connection was lost while this sale was being sent. It is held in Pending Invoices and will not be sent until someone checks it. Do not ring it up again as a new sale.",
				)}\n${reasons}`
			: reasons;
	}
	switch (result.reason) {
		case "quota":
			return __(
				"This device is out of storage, so the sale was NOT saved. Free some space and try again. Do not hand over the goods until it shows as saved.",
			);
		case "unavailable":
			return __(
				"This browser's offline storage is not available, so the sale was NOT saved. Reload the page, or connect and sell online.",
			);
		case "data":
			return __("The sale could not be stored on this device, so it was NOT saved.");
		default:
			return __("Failed to save invoice offline. The sale was NOT saved.");
	}
}

/**
 * Complete a sale with no server: queue the invoice, print its receipt from local data when
 * asked, and clear the cart. Returns false if the invoice could not be queued, leaving the
 * cart as it was.
 */
export function useOfflineSale() {
	const cartStore = useCartStore();
	const offlineStore = useOfflineStore();
	const posStore = usePosStore();
	const { printReceiptOffline } = usePrintInvoice();
	const lastFailure = ref("");

	async function completeOfflineSale(
		invoiceData: InvoiceData,
		options: { withPrint: boolean; cashier?: string },
	): Promise<boolean> {
		lastFailure.value = "";
		// Taken before the cart is cleared: it is what the customer paid for.
		const receipt = cartStore.getReceiptSnapshot("", options.cashier || "");

		const result = await offlineStore.saveOffline(
			invoiceData,
			cartStore.customerName,
			cartStore.grandTotal,
			cartStore.getStockReservations(),
			receipt,
		);
		if (!result.success || result.localId === undefined) {
			lastFailure.value = saveFailureMessage(result);
			return false;
		}

		const name = offlineReceiptName(result.localId);
		posStore.lastInvoiceName = name;
		showInfo(__("Invoice saved offline ({0}). It will sync when you're back online.", [name]));

		cartStore.clearAll();
		if (options.withPrint) {
			await printReceiptOffline({ ...receipt, name });
		}

		return true;
	}

	return { completeOfflineSale, lastFailure };
}
