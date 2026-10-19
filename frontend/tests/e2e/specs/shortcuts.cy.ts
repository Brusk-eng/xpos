/**
 * Every documented keyboard shortcut, pressed as a real key (CDP), with its visible effect.
 *
 * Written against what the shortcut registry, KeyboardShortcutsDialog, MenuBar and CommandSearch
 * promise. Selectors stay layout-agnostic (dialog titles, focus, URL, stub calls) so the same spec
 * runs on older builds to compare behaviour.
 */
import { ITEM_A, ITEM_B, PERMISSIONS } from "../fixtures/pos";
import { cartRoutes } from "../fixtures/cartPayment";
import { callsTo } from "../support/frappeStub";
import { realPress } from "../support/realKeys";

const PROFILE = {
	allow_return: 1,
	allow_pos_expense: 1,
	allow_cash_deposit: 1,
	enable_cash_movement: 1,
};

function boot() {
	cy.viewport(1440, 900);
	cy.bootPos({
		routes: {
			...cartRoutes(PROFILE),
			"xpos.api.auth.get_my_pos_permissions": { ...PERMISSIONS, expense: true, bank_drop: true },
			"xpos.api.invoices.get_recent_invoices": [],
			"xpos.api.cash_movements.get_cash_movement_context": {
				expense_accounts: [],
				deposit_accounts: [],
			},
		},
	});
}

function addItem(name: string) {
	cy.contains("[data-item-index]", name).click();
}

function searchInput() {
	return cy.get("input[placeholder*='Search']").filter(":visible").first();
}

function dialog(title: string | RegExp) {
	return cy
		.contains("[role='dialog'], [role='alertdialog']", title, { timeout: 6000 })
		.should("be.visible");
}

function noDialog() {
	cy.get("[role='dialog']:visible, [role='alertdialog']:visible").should("not.exist");
}

function closeDialogs() {
	realPress("Escape");
	noDialog();
}

function focusBody() {
	cy.document().then((doc) => {
		(doc.activeElement as HTMLElement | null)?.blur?.();
		doc.body.focus();
	});
}

describe("keyboard shortcuts", () => {
	beforeEach(() => {
		boot();
		focusBody();
	});

	it("Ctrl+K opens command search (body and search field)", () => {
		realPress("ctrl+k");
		cy.get("input[placeholder*='pages, actions']").should("be.visible");
		closeDialogs();
		searchInput().focus();
		realPress("ctrl+k");
		cy.get("input[placeholder*='pages, actions']").should("be.visible");
	});

	it("Ctrl+K opens command search from a cart quantity and after reopening", () => {
		addItem(ITEM_A.item_name);
		cy.get("input[aria-label='Quantity']:visible").first().focus();
		realPress("ctrl+k");
		cy.get("input[placeholder*='pages, actions']").should("be.visible");
		closeDialogs();
		realPress("ctrl+k");
		cy.get("input[placeholder*='pages, actions']").should("be.visible");
	});

	it("Ctrl+K opens command search from another page", () => {
		realPress("alt+2");
		cy.location("pathname").should("match", /orders$/);
		realPress("ctrl+k");
		cy.get("input[placeholder*='pages, actions']").should("be.visible");
	});

	it("Ctrl+/ opens the shortcut list", () => {
		realPress("ctrl+/");
		dialog("Keyboard Shortcuts");
	});

	it("F1 and F2 focus product search", () => {
		realPress("F2");
		cy.focused()
			.should("have.attr", "placeholder")
			.and("match", /Search/);
		focusBody();
		realPress("F1");
		cy.focused().should("match", "input");
	});

	it("/ focuses search and typing a letter starts a search", () => {
		realPress("/");
		cy.focused()
			.should("have.attr", "placeholder")
			.and("match", /Search/);
		focusBody();
		realPress("f");
		searchInput().should("have.value", "f");
	});

	it("F5 toggles grid/list", () => {
		cy.get("[data-item-index]").first().invoke("prop", "outerHTML").as("before", { type: "static" });
		realPress("F5");
		cy.get("@before").then((before) => {
			cy.get("[data-item-index]").first().invoke("prop", "outerHTML").should("not.eq", before);
		});
	});

	it("F6 opens customer selection", () => {
		realPress("F6");
		dialog("Select Customer");
	});

	it("F8 opens held orders", () => {
		realPress("F8");
		dialog(/Recall Order|Held|Draft/);
	});

	it("F3 focuses the first cart quantity", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("F3");
		cy.focused().should("match", "input").and("have.attr", "aria-label", "Quantity");
	});

	it("F4 opens payment, Esc closes it, Enter pays", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("F4");
		dialog("Payment");
		realPress("Escape");
		noDialog();
		realPress("F4");
		dialog("Payment");
		realPress("Enter");
		cy.wrap(null).should(() => {
			expect(callsTo("xpos.api.invoices.create_invoice")).to.have.length(1);
		});
		noDialog();
	});

	it("F4 works while the search field has focus", () => {
		addItem(ITEM_A.item_name);
		searchInput().focus();
		realPress("F4");
		dialog("Payment");
	});

	it("Ctrl+G opens repeat, Ctrl+R opens returns", () => {
		realPress("ctrl+g");
		dialog("Repeat Invoice");
		closeDialogs();
		realPress("ctrl+r");
		dialog("Return Invoice");
	});

	it("Ctrl+H holds the current sale", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("ctrl+h");
		cy.wrap(null).should(() => {
			expect(callsTo("xpos.api.invoices.save_draft_invoice")).to.have.length(1);
		});
		cy.get("[data-cart-index]:visible").should("not.exist");
	});

	it("Ctrl+D opens the additional discount", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("ctrl+d");
		cy.contains("Additional Discount").should("be.visible");
		cy.focused().should("match", "input");
	});

	it("Delete removes the selected line, Ctrl+Delete asks to clear", () => {
		addItem(ITEM_A.item_name);
		addItem(ITEM_B.item_name);
		cy.get("[data-cart-index='0']:visible").click("left");
		realPress("Delete");
		cy.get("[data-cart-index]:visible").should("have.length", 1);
		focusBody();
		realPress("ctrl+Delete");
		dialog("Clear cart?");
	});

	it("Ctrl+N starts a new sale (asks before clearing)", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("ctrl+n");
		dialog("Clear cart?");
	});

	it("Ctrl+E opens a cash expense", () => {
		realPress("ctrl+e");
		dialog("POS Expense");
	});

	it("Ctrl+Shift+D opens a cash deposit", () => {
		realPress("ctrl+shift+d");
		dialog("Cash Deposit");
	});

	it("Ctrl+E then Esc then Ctrl+Shift+D reopens cash movements", () => {
		realPress("ctrl+e");
		dialog("POS Expense");
		closeDialogs();
		realPress("ctrl+shift+d");
		dialog("Cash Deposit");
	});

	it("Ctrl+Shift+O opens close shift", () => {
		realPress("ctrl+shift+o");
		dialog("Close Shift");
	});

	it("Alt+2 goes to Orders and Alt+1 comes back", () => {
		realPress("alt+2");
		cy.location("pathname").should("match", /orders$/);
		realPress("alt+1");
		cy.location("pathname").should("match", /pos$/);
	});

	it("cart rows: arrows move between rows, Enter edits quantity", () => {
		addItem(ITEM_A.item_name);
		addItem(ITEM_B.item_name);
		cy.get("[data-cart-index='0']:visible").focus();
		realPress("ArrowDown");
		cy.focused().should("have.attr", "data-cart-index", "1");
		realPress("Enter");
		cy.focused().should("have.attr", "aria-label", "Quantity");
	});

	it("payment: arrows switch method, Ctrl+Enter saves without printing", () => {
		addItem(ITEM_A.item_name);
		focusBody();
		realPress("F4");
		dialog("Payment");
		cy.get("[data-testid='payment-method']").first().focus();
		realPress("ArrowRight");
		cy.focused().should("have.attr", "data-mode", "Card");
		realPress("ArrowLeft");
		cy.focused().should("have.attr", "data-mode", "Cash");
		realPress("ctrl+Enter");
		cy.wrap(null).should(() => {
			expect(callsTo("xpos.api.invoices.create_invoice")).to.have.length(1);
		});
	});
});
