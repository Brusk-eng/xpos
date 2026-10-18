/**
 * A large, awkward catalogue for the product-browsing specs.
 *
 * Test data only: it exists to push the catalogue UI through what real stores send it -
 * very long and right-to-left names, missing and broken images, variant templates,
 * unpriced and out-of-stock items, and an item-group tree far too big to show at once.
 * Shapes follow xpos/api/items.py (`get_pos_items`, `get_item_groups`).
 */
import { ITEM_A } from "./pos";

const PRODUCT_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">` +
			`<rect width="400" height="300" fill="#eef2f7"/>` +
			`<rect x="140" y="40" width="120" height="220" rx="18" fill="#94a3b8"/>` +
			`<rect x="160" y="70" width="80" height="60" rx="8" fill="#e2e8f0"/></svg>`,
	);

/** A tall, narrow product shot: proves the image box keeps its size. */
const TALL_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="600" viewBox="0 0 120 600">` +
			`<rect width="120" height="600" fill="#fde68a"/><rect x="30" y="20" width="60" height="560" rx="20" fill="#b45309"/></svg>`,
	);

const DEPARTMENTS = [
	"Hardware",
	"Plumbing & Pipe Fittings",
	"Electrical",
	"Paint & Decorating",
	"Garden & Outdoor Living",
	"Tools",
	"Fasteners",
	"Building Materials",
	"Kitchen & Bath",
	"Safety & Workwear",
	"Automotive",
	"Cleaning Supplies",
];
const CATEGORY_WORDS = ["Standard", "Professional Grade", "Heavy Duty Commercial", "Economy", "Specialty"];
const SUB_WORDS = ["Small", "Medium", "Large", "Extra Large Industrial Size", "Assorted"];

export interface FixtureGroup {
	name: string;
	parent_item_group: string;
	image?: string;
}

/** 12 departments × 5 categories × 5 sub-categories: 372 groups, 4 levels with the root. */
export function buildGroupTree(): { groups: FixtureGroup[]; parent_groups: FixtureGroup[] } {
	const parents: FixtureGroup[] = [{ name: "All Item Groups", parent_item_group: "" }];
	const leaves: FixtureGroup[] = [];
	for (const dept of DEPARTMENTS) {
		parents.push({ name: dept, parent_item_group: "All Item Groups" });
		for (const cat of CATEGORY_WORDS) {
			const catName = `${dept} - ${cat}`;
			parents.push({ name: catName, parent_item_group: dept });
			for (const sub of SUB_WORDS) {
				leaves.push({ name: `${catName} - ${sub}`, parent_item_group: catName });
			}
		}
	}
	return { groups: leaves, parent_groups: parents };
}

export const GROUP_TREE = buildGroupTree();

const base = { ...ITEM_A, brand: "", image: "" };

/** The items every screenshot needs on the first page, in grid order. */
export const SPECIAL_ITEMS = [
	{
		...base,
		item_code: "HW-SCREW-M8-60-A2-BOX100",
		item_name:
			"Stainless Steel Hex Head Cap Screw M8 × 1.25 × 60 mm, Fully Threaded, DIN 933 A2-70 (Box of 100)",
		item_group: "Fasteners - Professional Grade - Assorted",
		rate: 2450.5,
		actual_qty: 1840,
		image: PRODUCT_IMAGE,
	},
	{
		...base,
		item_code: "HW-DRILL-TPL",
		item_name: "Cordless Drill Driver 18V",
		item_group: "Tools - Standard - Medium",
		rate: 129,
		actual_qty: 12,
		has_variants: 1,
		image: PRODUCT_IMAGE,
	},
	{
		...base,
		item_code: "HW-SCREWDRIVER-AR",
		item_name: "مفك براغي فيليبس مقاس ٢ بمقبض مطاطي مريح ومقاوم للانزلاق",
		item_group: "Tools - Standard - Small",
		rate: 18.75,
		actual_qty: 3,
		image: "",
	},
	{
		...base,
		item_code: "HW-PIPE-CPVC-OOS",
		item_name: "CPVC Hot Water Pipe 3/4 in × 10 ft",
		item_group: "Plumbing & Pipe Fittings - Standard - Medium",
		rate: 22,
		actual_qty: 0,
		image: PRODUCT_IMAGE,
	},
	{
		...base,
		item_code: "HW-SAMPLE-NOPRICE",
		item_name: "Paint Colour Sample Card (no price set)",
		item_group: "Paint & Decorating - Specialty - Small",
		rate: 0,
		actual_qty: 250,
		image: "",
	},
	{
		...base,
		item_code: "HW-BROKEN-IMG",
		item_name: "Garden Hose Reel with Broken Image Link",
		item_group: "Garden & Outdoor Living - Standard - Large",
		rate: 64.99,
		actual_qty: 40,
		image: "/files/xpos-e2e-missing-image.png",
	},
	{
		...base,
		item_code: "SRV-KEY-CUT",
		item_name: "Key Cutting Service",
		item_group: "Hardware - Specialty - Small",
		rate: 4,
		actual_qty: 0,
		is_stock_item: 0,
		image: "",
	},
	{
		...base,
		item_code: "HW-LEVEL-TALL",
		item_name: "Aluminium Spirit Level 1200 mm",
		item_group: "Tools - Professional Grade - Large",
		rate: 45,
		actual_qty: 7,
		image: TALL_IMAGE,
	},
];

/** Ordinary filler so the grid scrolls and pages like a real store. */
export const FILLER_ITEMS = Array.from({ length: 112 }, (_, i) => {
	const dept = DEPARTMENTS[i % DEPARTMENTS.length];
	const cat = CATEGORY_WORDS[i % CATEGORY_WORDS.length];
	const sub = SUB_WORDS[(i >> 2) % SUB_WORDS.length];
	return {
		...base,
		item_code: `HW-${String(i + 1).padStart(4, "0")}`,
		item_name: `${dept} item ${i + 1}`,
		item_group: `${dept} - ${cat} - ${sub}`,
		rate: 5 + ((i * 37) % 400) + 0.99,
		actual_qty: (i * 13) % 90,
		image: i % 3 === 0 ? PRODUCT_IMAGE : "",
	};
});

export const CATALOG_ITEMS = [...SPECIAL_ITEMS, ...FILLER_ITEMS];

const groupPrefix = (group: string) => group.replace(/^All Item Groups$/, "");

/** `get_pos_items`: search, group-subtree filter and paging like the real endpoint. */
export function getPosItems(args: Record<string, unknown>): unknown {
	const term = String(args.search_term || "")
		.trim()
		.toLowerCase();
	const group = groupPrefix(String(args.item_group || ""));
	const start = Number(args.start || 0);
	const length = Number(args.page_length || 40);
	return CATALOG_ITEMS.filter(
		(item) =>
			(!group || item.item_group === group || item.item_group.startsWith(`${group} - `)) &&
			(!term ||
				item.item_name.toLowerCase().includes(term) ||
				item.item_code.toLowerCase().includes(term)),
	).slice(start, start + length);
}

export function catalogRoutes(): Record<string, unknown> {
	return {
		"xpos.api.items.get_pos_items": getPosItems,
		"xpos.api.items.get_items_count": CATALOG_ITEMS.length,
		"xpos.api.items.get_item_groups": GROUP_TREE,
		"xpos.api.items.get_stock_availability": CATALOG_ITEMS.map((i) => ({
			item_code: i.item_code,
			actual_qty: i.actual_qty,
		})),
		"xpos.api.items.get_item_detail": (args: Record<string, unknown>) => {
			const item = CATALOG_ITEMS.find((i) => i.item_code === args.item_code) || CATALOG_ITEMS[0];
			return {
				...item,
				uoms: [{ uom: item.stock_uom, conversion_factor: 1 }],
				batches: [],
				serial_numbers: [],
			};
		},
		"xpos.api.items.get_item_variants": [
			{
				item_code: "HW-DRILL-2AH",
				item_name: "Cordless Drill Driver 18V - 2.0Ah",
				rate: 129,
				actual_qty: 8,
			},
			{
				item_code: "HW-DRILL-4AH",
				item_name: "Cordless Drill Driver 18V - 4.0Ah",
				rate: 169,
				actual_qty: 4,
			},
		],
		"xpos.api.items.get_item_attributes": [],
		"xpos.api.items.search_barcode": (args: Record<string, unknown>) =>
			args.barcode === "4006381333931" ? { ...CATALOG_ITEMS[0], barcode: args.barcode } : null,
	};
}
