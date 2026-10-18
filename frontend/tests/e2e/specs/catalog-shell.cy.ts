/**
 * Shell + product browsing at the sizes tills actually run at.
 *
 * The screenshot pass captures every layout for review (`CYPRESS_shotSet=before|after` names the
 * set). The behaviour pass pins down what the layout must keep doing.
 */
import { OPEN_SHIFT, POS_PROFILE_DOC } from "../fixtures/pos";
import { catalogRoutes, SPECIAL_ITEMS } from "../fixtures/catalog";
import { callsTo, stub } from "../support/frappeStub";

const SET = String(Cypress.env("shotSet") || "after");
const VIEWPORTS: Array<[number, number]> = [
	[1440, 900],
	[1024, 768],
	[768, 1024],
	[390, 844],
];

const LONG_ITEM = SPECIAL_ITEMS[0];

/** What frappeStub.stubError() stores, usable directly in a boot route table. */
const ITEMS_DOWN = { __xposStubError: true, message: "Item service unavailable", excType: "ValidationError" };

function bootCatalog(
	options: { theme?: "dark"; failItems?: boolean; profile?: Record<string, unknown> } = {},
) {
	cy.viewport(1440, 900);
	cy.bootPos({
		routes: {
			...catalogRoutes(),
			...(options.failItems ? { "xpos.api.items.get_pos_items": ITEMS_DOWN } : {}),
			"xpos.api.shifts.check_open_shift": {
				...OPEN_SHIFT,
				pos_profile: { ...POS_PROFILE_DOC, display_item_code: 1, ...(options.profile || {}) },
				stock_settings: { allow_negative_stock: false },
			},
		},
		readyItem: "Cordless Drill Driver 18V",
		skipReadyWait: options.failItems,
		beforeLoad: (win) => {
			if (options.theme) win.localStorage.setItem("xpos-theme", options.theme);
		},
	});
}

function shot(name: string) {
	// Let lazy images, transitions and the debounce settle so screenshots are comparable.
	cy.wait(400);
	cy.screenshot(`${SET}/${name}`, { capture: "viewport", overwrite: true });
}

function toggleView() {
	cy.window().then((win) => win.dispatchEvent(new CustomEvent("xpos:toggle-view")));
}

function setDir(dir: "ltr" | "rtl") {
	cy.document().then((doc) => {
		doc.documentElement.dir = dir;
	});
}

function openCurrentSaleTabIfPresent() {
	cy.get("body").then(($body) => {
		const tab = $body
			.find("[role='tab']:visible")
			.filter((_, el) => /Current sale/.test(el.textContent || ""));
		if (tab.length) cy.wrap(tab.first()).click();
	});
}

function openProductsTabIfPresent() {
	cy.get("body").then(($body) => {
		const tab = $body
			.find("[role='tab']:visible")
			.filter((_, el) => /Products/.test(el.textContent || ""));
		if (tab.length) cy.wrap(tab.first()).click();
	});
}

describe("catalog shell screenshots", () => {
	it("captures grid, list and cart at each viewport (LTR + RTL)", () => {
		bootCatalog();
		cy.contains(LONG_ITEM.item_name).click();

		for (const dir of ["ltr", "rtl"] as const) {
			setDir(dir);
			for (const [w, h] of VIEWPORTS) {
				if (dir === "rtl" && w !== 1440 && w !== 390) continue;
				cy.viewport(w, h);
				openProductsTabIfPresent();
				shot(`${w}-${dir}-grid`);
				toggleView();
				shot(`${w}-${dir}-list`);
				toggleView();
				if (w < 1024) {
					openCurrentSaleTabIfPresent();
					shot(`${w}-${dir}-cart`);
					openProductsTabIfPresent();
				}
			}
		}
	});

	it("captures the category browser with a 372-group tree", () => {
		bootCatalog();
		cy.contains("button", /^\s*(Categories|Browse)/).click();
		shot("1440-ltr-categories");
	});

	it("captures dark mode", () => {
		bootCatalog({ theme: "dark" });
		shot("1440-dark-grid");
		toggleView();
		shot("1440-dark-list");
	});

	it("captures the failure state", () => {
		bootCatalog({ failItems: true });
		cy.contains(/could not be loaded|No items found/, { timeout: 15000 });
		shot("1440-ltr-items-failed");
	});

	it("captures the logo sheet", () => {
		cy.viewport(1280, 800);
		for (const theme of ["light", "dark"] as const) {
			cy.visit(`/xpos/showcase?theme=${theme}`);
			// The showcase header is sticky and would cover the section once Cypress scrolls to it.
			cy.get("header").first().invoke("css", "position", "static");
			cy.get("#brand").screenshot(`${SET}/logo-${theme}`, { overwrite: true });
		}
	});
});

describe("catalog shell behaviour", () => {
	const searchInput = () => cy.get("[data-testid='barcode-input']");
	const tile = (index: number) => cy.get(`[data-item-index='${index}']:visible`);

	it("mounts one cart and keeps the catalogue at least 32rem wide at 1024px", () => {
		bootCatalog();
		cy.viewport(1024, 768);
		cy.contains(LONG_ITEM.item_name).click();
		cy.get("[data-cart-index]").should("have.length", 1);
		cy.get("#pos-products").invoke("outerWidth").should("be.gte", 512);
		cy.get("#pos-cart").invoke("outerWidth").should("be.gte", 432);
	});

	it("resizes the cart from the keyboard and remembers the width", () => {
		bootCatalog();
		cy.get("[data-testid='cart-splitter']").as("splitter").focus();
		cy.get("@splitter")
			.invoke("attr", "aria-valuenow")
			.then((start) => {
				cy.get("@splitter").type("{leftarrow}{leftarrow}");
				cy.get("@splitter").should("have.attr", "aria-valuenow", String(Number(start) + 32));
				cy.get("#pos-cart")
					.invoke("outerWidth")
					.should("be.closeTo", Number(start) + 32, 1);
				cy.window()
					.its("localStorage")
					.invoke("getItem", "xpos_setting_pos_cart_width")
					.should("eq", String(Number(start) + 32));
				bootCatalog();
				cy.get("[data-testid='cart-splitter']").should(
					"have.attr",
					"aria-valuenow",
					String(Number(start) + 32),
				);
			});
	});

	it("browses a 372-group tree one level at a time and searches the rest", () => {
		bootCatalog();
		const chips = () => cy.get("[data-testid='category-bar'] [data-chip]");
		// "All products" crumb + the 12 departments; nothing deeper is rendered.
		chips().should("have.length", 13);
		cy.get("[data-testid='category-bar']").should("not.contain", "Hardware - Standard - Small");

		chips().contains("Hardware").click();
		cy.wrap(null).then(() =>
			expect(callsTo("xpos.api.items.get_pos_items").at(-1)?.args.item_group).to.eq("Hardware"),
		);
		cy.get("[data-testid='category-bar'] nav")
			.should("contain", "All products")
			.and("contain", "Hardware");
		chips().filter("[aria-pressed]").should("have.length", 5);
		cy.contains("[data-testid='category-bar'] [data-chip]", /^\s*Standard\s*$/).click();
		cy.get("[data-testid='category-bar'] nav").should("contain", "Standard");
		chips().filter("[aria-pressed]").should("have.length", 5).first().should("contain", "Small");

		cy.get("[data-testid='category-browse']").click();
		cy.focused().type("Extra Large Industrial");
		cy.get("[role='listbox'] [role='option']").should("have.length", 50);
		cy.get("[role='listbox'] [role='option']").first().click();
		cy.get("[role='listbox']").should("not.exist");
		searchInput().should("have.focus");
		cy.wrap(null).then(() =>
			expect(String(callsTo("xpos.api.items.get_pos_items").at(-1)?.args.item_group)).to.match(
				/Extra Large Industrial Size$/,
			),
		);
	});

	it("keeps focus predictable for keyboard-only use and scanning", () => {
		bootCatalog();
		searchInput().focus().type("Cordless");
		tile(0).should("contain", "Cordless Drill Driver 18V");
		searchInput().type("{downarrow}");
		tile(0).should("have.class", "ring-2");
		searchInput().type("{enter}");
		cy.get("[role='dialog']").should("be.visible");
		cy.get("body").type("{esc}");
		cy.get("[role='dialog']").should("not.exist");
		searchInput().should("have.focus");

		searchInput().clear().type("4006381333931{enter}");
		cy.cartRows().should("have.length", 1);
		searchInput().should("have.focus").and("have.value", "");
	});

	it("shows item states without changing what can be sold", () => {
		bootCatalog();
		// Every tile exposes a reachable add and details control.
		tile(0)
			.find("button")
			.should("have.length", 2)
			.each(($b) => expect($b.attr("tabindex")).to.not.eq("-1"));
		tile(0)
			.find("[data-testid='item-details']")
			.should("have.attr", "aria-label")
			.and("contain", "Details for");

		tile(1).should("have.attr", "data-state", "template").and("contain", "Variants");
		tile(1)
			.find("[data-testid='item-add']")
			.should("have.attr", "aria-label")
			.and("match", /^Choose variant/);

		tile(3).should("have.attr", "data-state", "unavailable").and("contain", "Out of stock");
		tile(3)
			.find("[data-testid='item-add']")
			.should("have.attr", "aria-disabled", "true")
			.click({ force: true });
		cy.get("[data-cart-index]").should("have.length", 0);

		tile(4).find("[data-testid='price-missing']").should("contain", "No price");
		tile(5).find("img").should("not.exist"); // broken link fell back to the placeholder
		tile(6).should("not.contain", "In stock"); // non-stock service has no stock badge

		cy.window().then((win) => win.dispatchEvent(new CustomEvent("xpos:toggle-view")));
		tile(3).find("[data-testid='item-add']").should("have.attr", "aria-disabled", "true");
		tile(4).should("contain", "No price");
	});

	it("tells a failed load apart from an empty catalogue and retries", () => {
		bootCatalog({ failItems: true });
		cy.get("[data-testid='items-error']").should("contain", "could not be loaded");
		cy.then(() => stub("xpos.api.items.get_pos_items", catalogRoutes()["xpos.api.items.get_pos_items"]));
		cy.contains("button", "Try again").click();
		cy.contains("Cordless Drill Driver 18V").should("be.visible");

		searchInput().type("zzzz-no-such-item");
		cy.get("[data-testid='items-empty']").should("contain", "No products match");
		cy.contains("button", "Clear filters").click();
		searchInput().should("have.value", "").and("have.focus");
		cy.contains("Cordless Drill Driver 18V").should("be.visible");
	});

	it("keeps checkout one tap away on a phone", () => {
		bootCatalog();
		cy.viewport(390, 844);
		cy.get("[data-testid='checkout-bar']").should("not.exist");
		tile(0).find("[data-testid='item-add']").click();
		cy.get("[data-testid='checkout-bar']").should("be.visible").and("contain", "1 item").click();
		cy.get("#pos-tab-cart").should("have.attr", "aria-selected", "true");
		cy.contains("button", /Pay/).should("be.visible");
	});
});
