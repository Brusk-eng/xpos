/**
 * A real sale captured on the device. The record is written durably BEFORE any network call, keeps the tender and
 * receipt evidence the cashier saw, and is never deleted: ERPNext decides the posted result, the device keeps the
 * evidence until a manager has reconciled anything the server refused.
 */
import { canonicalJson, sha256Hex } from "./txn";
import { formatMinor, lineTotalMinor } from "./money";

export type SaleStatus =
	/** Saved on the device, not yet sent. */
	| "captured"
	/** A request is in flight (or was, when the app died): treat like uncertain on restart. */
	| "posting"
	/** ERPNext created the invoice. */
	| "posted"
	/** ERPNext priced the sale differently; waiting for the cashier to accept the new prices. */
	| "reprice"
	/** The request may have reached the server (timeout, lost reply). Retried with the same id. */
	| "uncertain"
	/** Could not be sent (offline, session expired). Retried when possible. */
	| "held"
	/** ERPNext refused the sale. Held for a manager; never deleted. */
	| "rejected"
	/** Invoice saved but the fiscal (FBR) step is not complete. */
	| "fiscal_pending";

export const OPEN_STATUSES: SaleStatus[] = [
	"captured",
	"posting",
	"reprice",
	"uncertain",
	"held",
	"rejected",
	"fiscal_pending",
];

export interface TenderEvidence {
	mode: string;
	type: string | null;
	amountMinor: number;
	/** Reference typed by the cashier from the card terminal / transfer slip. */
	reference?: string;
	/** The cashier states the terminal approved it. The app cannot verify this. */
	terminalConfirmed?: boolean;
}

export interface ReceiptLine {
	itemCode: string;
	name: string;
	uom: string;
	priceMinor: number;
	qtyMilli: number;
	totalMinor: number;
}

export interface SaleEvidence {
	tenders: TenderEvidence[];
	lines: ReceiptLine[];
	/** Estimate shown to the cashier (from the server quote); ERPNext's posted totals replace it. */
	quotedPayableMinor: number;
	changeMinor: number;
	customer: string;
	capturedAt: number;
}

export interface SaleRecord {
	txnId: string;
	scopeId: string;
	status: SaleStatus;
	/** The exact `data` argument for xpos.api.invoices.create_invoice (JSON). */
	bodyJson: string;
	contentHash: string;
	currency: string;
	minorDigits: number;
	payableMinor: number;
	evidenceJson: string;
	/** Last server answer (JSON) or null. */
	serverJson: string | null;
	invoice: string | null;
	message: string;
	attempts: number;
	createdAt: number;
	updatedAt: number;
}

export interface NewSale {
	txnId: string;
	scopeId: string;
	body: Record<string, unknown>;
	currency: string;
	minorDigits: number;
	payableMinor: number;
	evidence: SaleEvidence;
}

/** A NewSale with its canonical strings and hash, as stored (Kotlin never has to canonicalize decimal JSON). */
export interface PreparedSale {
	txnId: string;
	scopeId: string;
	bodyJson: string;
	contentHash: string;
	currency: string;
	minorDigits: number;
	payableMinor: number;
	evidenceJson: string;
}

export async function prepareSale(s: NewSale): Promise<PreparedSale> {
	return {
		txnId: s.txnId,
		scopeId: s.scopeId,
		bodyJson: canonicalJson(s.body),
		contentHash: await hashBody(s.body),
		currency: s.currency,
		minorDigits: s.minorDigits,
		payableMinor: s.payableMinor,
		evidenceJson: canonicalJson(s.evidence),
	};
}

export interface SalePatch {
	status?: SaleStatus;
	serverJson?: string | null;
	invoice?: string | null;
	message?: string;
	bodyJson?: string;
	evidenceJson?: string;
	payableMinor?: number;
	/** Count one more send attempt. */
	attempt?: boolean;
}

export class SaleConflictError extends Error {
	constructor(readonly txnId: string) {
		super(`sale id ${txnId} already exists with different contents`);
		this.name = "SaleConflictError";
	}
}

export function newSaleId(): string {
	return "mob-" + globalThis.crypto.randomUUID();
}

export async function hashBody(body: unknown): Promise<string> {
	return sha256Hex(canonicalJson(body));
}

export interface CartLineInput {
	itemCode: string;
	name: string;
	uom: string;
	priceMinor: number;
	qtyMilli: number;
}

export interface SaleContext {
	profile: string;
	customer: string;
	shift: string | null;
	minorDigits: number;
}

/** The create_invoice payload. `rate` is what the cashier was quoted; ERPNext re-prices and refuses to guess. */
export function buildInvoiceBody(
	ctx: SaleContext,
	txnId: string,
	lines: (CartLineInput & { rate: number; itemTaxTemplate?: string | null })[],
	tenders: TenderEvidence[],
	changeMinor: number,
): Record<string, unknown> {
	const dec = (m: number) => Number(formatMinor(m, ctx.minorDigits));
	return {
		local_id: txnId,
		pos_profile: ctx.profile,
		customer: ctx.customer,
		pos_opening_shift: ctx.shift,
		items: lines.map((l, i) => ({
			row_id: String(i),
			item_code: l.itemCode,
			item_name: l.name,
			qty: l.qtyMilli / 1000,
			uom: l.uom,
			rate: l.rate,
			...(l.itemTaxTemplate ? { item_tax_template: l.itemTaxTemplate } : {}),
		})),
		payments: tenders.map((t) => ({
			mode_of_payment: t.mode,
			amount: dec(t.amountMinor),
			...(t.reference ? { reference_no: t.reference } : {}),
		})),
		change_amount: dec(changeMinor),
	};
}

export function receiptLines(lines: CartLineInput[]): ReceiptLine[] {
	return lines.map((l) => ({
		itemCode: l.itemCode,
		name: l.name,
		uom: l.uom,
		priceMinor: l.priceMinor,
		qtyMilli: l.qtyMilli,
		totalMinor: lineTotalMinor(l.priceMinor, l.qtyMilli),
	}));
}

/** Plain-language state for the cashier. Never claims more than the server confirmed. */
export function describeSale(s: Pick<SaleRecord, "status" | "invoice" | "message">): string {
	switch (s.status) {
		case "captured":
			return "Saved on this device. Not sent to ERPNext yet.";
		case "posting":
			return "Sending to ERPNext…";
		case "posted":
			return s.invoice ? `Posted to ERPNext as ${s.invoice}.` : "Posted to ERPNext.";
		case "reprice":
			return s.message || "ERPNext changed the prices. Review them, then confirm.";
		case "uncertain":
			return "No answer from the server. The sale may already be posted; it will be checked with the same sale id.";
		case "held":
			return s.message || "Waiting for the server. The sale is safe on this device.";
		case "rejected":
			return `ERPNext refused this sale${s.message ? `: ${s.message}` : ""}. A manager must reconcile it; the sale is kept on this device.`;
		case "fiscal_pending":
			return `Invoice ${s.invoice ?? ""} is saved but not fiscalized yet. ${s.message}`.trim();
	}
}
