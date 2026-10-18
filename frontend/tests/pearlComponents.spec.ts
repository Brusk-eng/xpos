/**
 * @vitest-environment jsdom
 *
 * Pearl shared components: behaviour added in the v3 revamp (Button loading, state components,
 * token class merging) plus a contrast guard for the light and dark token sets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { cn } from "@/lib/utils";

describe("Button", () => {
	it("blocks activation and announces busy while loading", async () => {
		let clicks = 0;
		const wrapper = mount(Button, {
			props: { loading: true, onClick: () => clicks++ },
			slots: { default: "Pay" },
		});
		const el = wrapper.get("button");
		expect(el.attributes("aria-busy")).toBe("true");
		expect(el.attributes("disabled")).toBeDefined();
		expect(el.text()).toContain("Pay");
		await el.trigger("click");
		expect(clicks).toBe(0);

		await wrapper.setProps({ loading: false });
		expect(el.attributes("aria-busy")).toBeUndefined();
		await el.trigger("click");
		expect(clicks).toBe(1);
	});

	it("keeps existing variants and lets consumer classes override token sizes", () => {
		const wrapper = mount(Button, { props: { variant: "outline", size: "icon-sm", class: "h-8 w-8" } });
		const cls = wrapper.get("button").classes();
		expect(cls).toContain("h-8");
		expect(cls).not.toContain("h-control-compact");
		expect(cls).toContain("border-border");
	});
});

describe("cn token merging", () => {
	it("replaces Pearl utilities with conflicting overrides", () => {
		expect(cn("h-control", "h-8")).toBe("h-8");
		expect(cn("shadow-raised", "shadow-none")).toBe("shadow-none");
		expect(cn("bg-surface-raised", "bg-primary")).toBe("bg-primary");
	});
});

describe("state components", () => {
	it("ErrorState is an alert and emits retry", async () => {
		const wrapper = mount(ErrorState, { props: { retryable: true, description: "Network down" } });
		expect(wrapper.attributes("role")).toBe("alert");
		await wrapper.get("button").trigger("click");
		expect(wrapper.emitted("retry")).toHaveLength(1);
	});

	it("LoadingState exposes a polite live label", () => {
		const wrapper = mount(LoadingState, { props: { label: "Loading stock" } });
		expect(wrapper.attributes("role")).toBe("status");
		expect(wrapper.attributes("aria-live")).toBe("polite");
		expect(wrapper.text()).toContain("Loading stock");
	});
});

describe("Pearl token contrast", () => {
	const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");

	function tokens(selector: string): Record<string, string> {
		const start = css.indexOf(`${selector} {`);
		const block = css.slice(start, css.indexOf("}", start));
		return Object.fromEntries(
			[...block.matchAll(/--([a-z-]+):\s*([\d.]+ [\d.]+% [\d.]+%);/g)].map((m) => [m[1], m[2]]),
		);
	}

	function luminance(triple: string): number {
		const [h, s, l] = triple.split(" ").map((v) => parseFloat(v));
		const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
		const f = (n: number) => {
			const k = (n + h / 30) % 12;
			const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		};
		return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
	}

	function ratio(a: string, b: string): number {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	}

	const text: [string, string][] = [
		["foreground", "background"],
		["foreground", "card"],
		["foreground", "surface-sunken"],
		["muted-foreground", "background"],
		["muted-foreground", "card"],
		["primary-foreground", "primary"],
		["destructive-foreground", "destructive"],
		["success-foreground", "success"],
		["warning-foreground", "warning"],
		["info-foreground", "info"],
		["success-soft-foreground", "success-soft"],
		["warning-soft-foreground", "warning-soft"],
		["info-soft-foreground", "info-soft"],
		["destructive-soft-foreground", "destructive-soft"],
		["surface-selected-foreground", "surface-selected"],
		["surface-inverse-foreground", "surface-inverse"],
	];

	for (const selector of [":root", ".dark"]) {
		const t = tokens(selector);
		it.each(text)(`${selector}: %s on %s is at least 4.5:1`, (fg, bg) => {
			expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
		});
		it(`${selector}: field borders are at least 3:1 against surfaces`, () => {
			expect(ratio(t.input, t.card)).toBeGreaterThanOrEqual(3);
			expect(ratio(t.input, t["surface-sunken"])).toBeGreaterThanOrEqual(3);
		});
	}
});
