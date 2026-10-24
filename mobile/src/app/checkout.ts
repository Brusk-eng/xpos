/**
 * Connected checkout against ERPNext, using the existing authorized XPOS sale API:
 *   quote_sale (xpos.api.mobile)      what ERPNext would charge: prices, taxes, amount to collect (read-only)
 *   create_invoice (xpos.api.invoices) creates the invoice; idempotent on local_id, re-prices on save and refuses
 *                                      to continue when rates moved (reply status "reprice_required")
 *
 * Order of events for a sale: quote -> tender entry -> durable local capture (sale row with tender and receipt
 * evidence) -> send. The row is written before the first byte leaves the device and is never deleted; its status says
 * exactly how far ERPNext got. Retrying always uses the same sale id, so a lost reply can never double-post.
 */
import type { ApiTransport, TransactionStore } from "@mobile/ports";
import { OfflineError, ServerError, SessionExpiredError } from "@mobile/adapters/frappeHttp";
import { fromRate } from "@mobile/domain/money";
import {
	buildInvoiceBody,
	OPEN_STATUSES,
	receiptLines,
	type CartLineInput,
	type SaleContext,
	type SaleEvidence,
	type SaleRecord,
	type SaleStatus,
	type TenderEvidence,
} from "@mobile/domain/sale";

export interface QuoteLine {
	rowId: string;
	itemCode: string;
	rate: number;
	itemTaxTemplate: string | null;
}

export interface Quote {
	payableMinor: number;
	netMinor: number;
	taxMinor: number;
	grandMinor: number;
	lines: QuoteLine[];
	priceList: string | null;
}

export class QuoteError extends Error {
	constructor(
		readonly code: "price_unavailable" | "offline" | "session" | "refused",
		message: string,
		readonly items: string[] = [],
	) {
		super(message);
		this.name = "QuoteError";
	}
}

interface QuoteReply {
	price_unavailable?: string[];
	price_list?: string | null;
	net_total?: number;
	total_taxes_and_charges?: number;
	grand_total?: number;
	payable?: number;
	lines: {
		row_id: string | number;
		item_code: string;
		rate: number | null;
		item_tax_template?: string | null;
	}[];
}

export async function quoteCart(api: ApiTransport, ctx: SaleContext, lines: CartLineInput[]): Promise<Quote> {
	let r: QuoteReply;
	try {
		r = await api.call<QuoteReply>("xpos.api.mobile.quote_sale", {
			pos_profile: ctx.profile,
			customer: ctx.customer,
			items: lines.map((l, i) => ({
				row_id: String(i),
				item_code: l.itemCode,
				qty: l.qtyMilli / 1000,
				uom: l.uom,
			})),
		});
	} catch (e) {
		if (e instanceof OfflineError)
			throw new QuoteError("offline", "The server cannot be reached. Checkout needs a connection.");
		if (e instanceof SessionExpiredError)
			throw new QuoteError("session", "Your server session has expired. Sign in again to continue.");
		if (e instanceof ServerError) throw new QuoteError("refused", e.message);
		throw e;
	}
	if (r.price_unavailable?.length)
		throw new QuoteError(
			"price_unavailable",
			`No price in the price list for: ${r.price_unavailable.join(", ")}. Remove them or ask a manager to add a price.`,
			r.price_unavailable,
		);
	const m = (n: number | undefined) => fromRate(Number(n ?? 0), ctx.minorDigits);
	return {
		payableMinor: m(r.payable ?? r.grand_total),
		netMinor: m(r.net_total),
		taxMinor: m(r.total_taxes_and_charges),
		grandMinor: m(r.grand_total),
		priceList: r.price_list ?? null,
		lines: r.lines.map((l) => ({
			rowId: String(l.row_id),
			itemCode: l.item_code,
			rate: Number(l.rate),
			itemTaxTemplate: l.item_tax_template ?? null,
		})),
	};
}

export function settleTenders(
	payableMinor: number,
	tenders: TenderEvidence[],
): { ok: true; changeMinor: number } | { ok: false; reason: string } {
	if (!tenders.length || tenders.some((t) => !Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0))
		return { ok: false, reason: "Enter an amount for each payment." };
	const total = tenders.reduce((s, t) => s + t.amountMinor, 0);
	if (total < payableMinor) return { ok: false, reason: "The payments do not cover the amount due." };
	const over = total - payableMinor;
	const cash = tenders.filter((t) => t.type === "Cash").reduce((s, t) => s + t.amountMinor, 0);
	if (over > cash)
		return { ok: false, reason: "Only cash can be over the amount due (that is the change)." };
	for (const t of tenders)
		if (t.type !== "Cash" && !t.terminalConfirmed)
			return { ok: false, reason: `Confirm that ${t.mode} was approved on the terminal.` };
	return { ok: true, changeMinor: over };
}

export interface CaptureInput {
	txnId: string;
	scopeId: string;
	ctx: SaleContext;
	currency: string;
	lines: CartLineInput[];
	quote: Quote;
	tenders: TenderEvidence[];
	now?: number;
}

/** Writes the sale durably. Resolves only after the row (with tender/receipt evidence) is committed. */
export async function captureSale(store: TransactionStore, c: CaptureInput): Promise<SaleRecord> {
	const settled = settleTenders(c.quote.payableMinor, c.tenders);
	if (!settled.ok) throw new Error(settled.reason);
	const rates = new Map(c.quote.lines.map((q) => [q.rowId, q]));
	const lines = c.lines.map((l, i) => {
		const q = rates.get(String(i));
		if (!q) throw new Error(`The server did not price ${l.name}.`);
		return { ...l, rate: q.rate, itemTaxTemplate: q.itemTaxTemplate };
	});
	const evidence: SaleEvidence = {
		tenders: c.tenders,
		lines: receiptLines(c.lines),
		quotedPayableMinor: c.quote.payableMinor,
		changeMinor: settled.changeMinor,
		customer: c.ctx.customer,
		capturedAt: c.now ?? Date.now(),
	};
	const { sale } = await store.saveSale({
		txnId: c.txnId,
		scopeId: c.scopeId,
		body: buildInvoiceBody(c.ctx, c.txnId, lines, c.tenders, settled.changeMinor),
		currency: c.currency,
		minorDigits: c.ctx.minorDigits,
		payableMinor: c.quote.payableMinor,
		evidence,
	});
	return sale;
}

interface InvoiceReply {
	name?: string;
	status?: string;
	duplicate?: boolean;
	grand_total?: number;
	message?: string;
	lines?: { row_id: string; rate: number | null; quoted_rate: number }[];
	rounded_total?: number;
}

/** Statuses a sale can be (re)sent from. `rejected` and `posted` are never resent automatically. */
const SENDABLE: SaleStatus[] = ["captured", "held", "uncertain", "posting"];

/**
 * Sends one captured sale. Safe to call again for the same sale at any time: ERPNext answers a repeat with the
 * invoice it already made.
 */
export async function sendSale(
	store: TransactionStore,
	api: ApiTransport,
	txnId: string,
): Promise<SaleRecord> {
	const sale = await store.getSale(txnId);
	if (!sale) throw new Error(`unknown sale ${txnId}`);
	if (!SENDABLE.includes(sale.status)) return sale;
	await store.updateSale(txnId, { status: "posting", attempt: true });
	let reply: InvoiceReply;
	try {
		reply = await api.call<InvoiceReply>("xpos.api.invoices.create_invoice", {
			data: JSON.parse(sale.bodyJson),
			local_id: txnId,
		});
	} catch (e) {
		if (e instanceof SessionExpiredError)
			return store.updateSale(txnId, {
				status: "held",
				message:
					"Your session expired. Sign in again; the sale is safe on this device and will be sent.",
			});
		if (e instanceof OfflineError)
			// the request may or may not have reached the server: the retry with the same id settles it
			return store.updateSale(txnId, {
				status: "uncertain",
				message: "No answer from the server. It may already be posted.",
			});
		if (e instanceof ServerError) {
			if (e.status >= 500 || e.status === 408 || e.status === 429)
				return store.updateSale(txnId, { status: "uncertain", message: e.message });
			return store.updateSale(txnId, { status: "rejected", message: e.message });
		}
		throw e;
	}
	const serverJson = JSON.stringify(reply);
	if (reply.status === "reprice_required")
		return store.updateSale(txnId, {
			status: "reprice",
			serverJson,
			message: reply.message || "ERPNext changed the prices.",
		});
	if (reply.status === "fbr_local_required" || reply.status === "fbr_uncertain")
		return store.updateSale(txnId, {
			status: "fiscal_pending",
			serverJson,
			invoice: reply.name ?? null,
			message:
				reply.status === "fbr_uncertain"
					? "FBR may have recorded this invoice without answering. A manager must check it in the web POS."
					: "The fiscal number is still needed. Finish it in the web POS.",
		});
	if (reply.name)
		return store.updateSale(txnId, {
			status: "posted",
			serverJson,
			invoice: reply.name,
			message: reply.status === "Queued" ? "Queued for submission on the server." : "",
		});
	return store.updateSale(txnId, {
		status: "rejected",
		serverJson,
		message: "The server answered without an invoice number.",
	});
}

export interface Reprice {
	payableMinor: number;
	lines: { rowId: string; quotedRate: number; rate: number | null }[];
	message: string;
}

/** The new prices ERPNext reported, for the cashier to review. */
export function repriceOf(sale: SaleRecord, minorDigits: number): Reprice | null {
	if (sale.status !== "reprice" || !sale.serverJson) return null;
	const r = JSON.parse(sale.serverJson) as {
		lines?: { row_id: string; rate: number | null; quoted_rate: number }[];
		rounded_total?: number;
		grand_total?: number;
		message?: string;
	};
	return {
		payableMinor: fromRate(Number(r.rounded_total || r.grand_total || 0), minorDigits),
		lines: (r.lines ?? []).map((l) => ({
			rowId: String(l.row_id),
			quotedRate: l.quoted_rate,
			rate: l.rate,
		})),
		message: r.message ?? "",
	};
}

/**
 * The cashier accepted ERPNext's new prices and re-took payment: the same sale (same id) gets the new rates and
 * tenders and goes back to `captured`, ready to send.
 */
export async function acceptReprice(
	store: TransactionStore,
	sale: SaleRecord,
	tenders: TenderEvidence[],
	minorDigits: number,
): Promise<SaleRecord> {
	const rp = repriceOf(sale, minorDigits);
	if (!rp) throw new Error("This sale has no price change to accept.");
	const settled = settleTenders(rp.payableMinor, tenders);
	if (!settled.ok) throw new Error(settled.reason);
	const body = JSON.parse(sale.bodyJson) as {
		items: { row_id: string; rate: number }[];
		payments: unknown[];
		change_amount: number;
	};
	for (const l of rp.lines) {
		const it = body.items.find((i) => i.row_id === l.rowId);
		if (it && l.rate !== null) it.rate = l.rate;
	}
	const dec = (m: number) => m / 10 ** minorDigits;
	body.payments = tenders.map((t) => ({
		mode_of_payment: t.mode,
		amount: dec(t.amountMinor),
		...(t.reference ? { reference_no: t.reference } : {}),
	}));
	body.change_amount = dec(settled.changeMinor);
	const evidence = JSON.parse(sale.evidenceJson) as SaleEvidence;
	evidence.tenders = tenders;
	evidence.changeMinor = settled.changeMinor;
	evidence.quotedPayableMinor = rp.payableMinor;
	return store.updateSale(sale.txnId, {
		status: "captured",
		bodyJson: JSON.stringify(body),
		evidenceJson: JSON.stringify(evidence),
		payableMinor: rp.payableMinor,
		message: "",
		serverJson: null,
	});
}

/** Sales still to be settled, oldest first, that can be sent without cashier input. */
export async function pendingSales(store: TransactionStore, scopeId: string): Promise<SaleRecord[]> {
	// only this cashier's sales: another user's session must never post them
	return (await store.listSales(OPEN_STATUSES, 200))
		.filter((s) => s.scopeId === scopeId && SENDABLE.includes(s.status))
		.reverse();
}

/** Sends everything waiting, one at a time and in order. Stops at the first session or connectivity problem. */
export async function drainPending(
	store: TransactionStore,
	api: ApiTransport,
	scopeId: string,
): Promise<SaleRecord[]> {
	const done: SaleRecord[] = [];
	for (const s of await pendingSales(store, scopeId)) {
		const r = await sendSale(store, api, s.txnId);
		done.push(r);
		if (r.status === "held" || r.status === "uncertain") break;
	}
	return done;
}
