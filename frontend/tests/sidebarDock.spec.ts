/**
 * @vitest-environment jsdom
 *
 * Sidebar invisible dock: desktop web pointers reveal it from the inline-start edge on hover
 * (no backdrop); the hamburger / bottom-nav toggle still opens the pinned drawer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { ref } from "vue";

const media = { matches: true };
vi.stubGlobal(
	"matchMedia",
	vi.fn(() => ({ matches: media.matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
);
vi.mock("@/services/electronBridge", () => ({ isElectron: () => false }));
vi.mock("@/services/userRights", () => ({ hasPermission: () => true }));
vi.mock("@/stores/posStore", () => ({
	usePosStore: () => ({ companyName: "Kodlyft", warehouse: "Stores - KL", allowPosExpense: true }),
}));

async function render(): Promise<VueWrapper> {
	vi.resetModules();
	const { default: Sidebar } = await import("@/components/Sidebar.vue");
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }],
	});
	await router.push("/pos");
	const wrapper = mount(Sidebar, {
		attachTo: document.body,
		global: { plugins: [router], provide: { isDark: ref(false) } },
	});
	// Fake timers only after the dynamic import, which stalls under fake timers on a loaded runner.
	vi.useFakeTimers();
	return wrapper;
}

const aside = (w: VueWrapper) => w.get("aside").element as HTMLElement;
const isShown = (w: VueWrapper) => aside(w).style.display !== "none";
const hasBackdrop = (w: VueWrapper) => w.find(".bg-scrim\\/40").exists();

// The first dynamic import transforms the whole Sidebar graph, which can exceed the 5s default.
describe("Sidebar dock", { timeout: 20_000 }, () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		media.matches = true;
	});
	afterEach(() => vi.useRealTimers());

	it("peeks on edge hover without a backdrop and hides after the pointer leaves", async () => {
		const w = await render();
		expect(isShown(w)).toBe(false);
		await w.get("[data-testid=sidebar-hot-zone]").trigger("mouseenter");
		vi.advanceTimersByTime(160);
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(true);
		expect(hasBackdrop(w)).toBe(false);

		await w.get("aside").trigger("mouseleave");
		vi.advanceTimersByTime(320);
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(false);
		w.unmount();
	});

	it("ignores a brief edge brush shorter than the intent delay", async () => {
		const w = await render();
		const zone = w.get("[data-testid=sidebar-hot-zone]");
		await zone.trigger("mouseenter");
		vi.advanceTimersByTime(80);
		await zone.trigger("mouseleave");
		vi.advanceTimersByTime(200);
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(false);
		w.unmount();
	});

	it("toggle event pins it open with a backdrop; Escape closes it", async () => {
		const w = await render();
		window.dispatchEvent(new CustomEvent("xpos:toggle-sidebar"));
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(true);
		expect(hasBackdrop(w)).toBe(true);

		await w.get("aside").trigger("mouseleave");
		vi.advanceTimersByTime(400);
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(true);

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await w.vm.$nextTick();
		expect(isShown(w)).toBe(false);
		w.unmount();
	});

	it("has no hover dock on touch devices", async () => {
		media.matches = false;
		const w = await render();
		expect(w.find("[data-testid=sidebar-hot-zone]").exists()).toBe(false);
		w.unmount();
	});
});
