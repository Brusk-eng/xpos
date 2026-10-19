/**
 * Trusted key presses through the Chrome DevTools Protocol.
 *
 * `cy.type()` synthesises DOM events and has no function keys, so it cannot prove that a real
 * F4 or Ctrl+K reaches the app the way a cashier's keyboard does (browser-level handling, focus,
 * capture-phase listeners). CDP `Input.dispatchKeyEvent` goes through the browser's input pipeline.
 */

type Modifier = "alt" | "ctrl" | "meta" | "shift";

const MODIFIER_BITS: Record<Modifier, number> = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const MODIFIER_KEYS: Record<Modifier, { key: string; code: string; keyCode: number }> = {
	alt: { key: "Alt", code: "AltLeft", keyCode: 18 },
	ctrl: { key: "Control", code: "ControlLeft", keyCode: 17 },
	meta: { key: "Meta", code: "MetaLeft", keyCode: 91 },
	shift: { key: "Shift", code: "ShiftLeft", keyCode: 16 },
};

const NAMED: Record<string, { code: string; keyCode: number }> = {
	Enter: { code: "Enter", keyCode: 13 },
	Escape: { code: "Escape", keyCode: 27 },
	Delete: { code: "Delete", keyCode: 46 },
	Backspace: { code: "Backspace", keyCode: 8 },
	Tab: { code: "Tab", keyCode: 9 },
	ArrowUp: { code: "ArrowUp", keyCode: 38 },
	ArrowDown: { code: "ArrowDown", keyCode: 40 },
	ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
	ArrowRight: { code: "ArrowRight", keyCode: 39 },
	"/": { code: "Slash", keyCode: 191 },
	",": { code: "Comma", keyCode: 188 },
};

function describeKey(key: string) {
	const fn = /^F(\d{1,2})$/.exec(key);
	if (fn) return { key, code: key, keyCode: 111 + Number(fn[1]), text: "" };
	if (NAMED[key]) return { key, ...NAMED[key], text: key.length === 1 ? key : "" };
	if (/^[a-z]$/i.test(key)) {
		return { key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key };
	}
	if (/^\d$/.test(key)) return { key, code: `Digit${key}`, keyCode: key.charCodeAt(0), text: key };
	throw new Error(`realKeys: unsupported key ${key}`);
}

function send(params: Record<string, unknown>) {
	return Cypress.automation("remote:debugger:protocol", { command: "Input.dispatchKeyEvent", params });
}

/** Press `combo` such as "F4", "ctrl+k", "ctrl+shift+o", "alt+2" or "e". */
export function realPress(combo: string): Cypress.Chainable<void> {
	const parts = combo.split("+");
	const main = parts.pop() as string;
	const mods = parts.map((p) => p.toLowerCase() as Modifier);
	const bits = mods.reduce((sum, m) => sum | MODIFIER_BITS[m], 0);
	const k = describeKey(main);
	// Modified printable keys (Ctrl+K) carry no text, exactly like a physical keyboard.
	const text = bits & (MODIFIER_BITS.ctrl | MODIFIER_BITS.alt | MODIFIER_BITS.meta) ? "" : k.text;

	return cy.wrap(null, { log: false }).then(async () => {
		let held = 0;
		for (const m of mods) {
			held |= MODIFIER_BITS[m];
			const mk = MODIFIER_KEYS[m];
			await send({
				type: "rawKeyDown",
				modifiers: held,
				key: mk.key,
				code: mk.code,
				windowsVirtualKeyCode: mk.keyCode,
			});
		}
		await send({
			type: text ? "keyDown" : "rawKeyDown",
			modifiers: bits,
			key: k.key,
			code: k.code,
			windowsVirtualKeyCode: k.keyCode,
			...(text ? { text, unmodifiedText: text } : {}),
		});
		await send({
			type: "keyUp",
			modifiers: bits,
			key: k.key,
			code: k.code,
			windowsVirtualKeyCode: k.keyCode,
		});
		for (const m of [...mods].reverse()) {
			held &= ~MODIFIER_BITS[m];
			const mk = MODIFIER_KEYS[m];
			await send({
				type: "keyUp",
				modifiers: held,
				key: mk.key,
				code: mk.code,
				windowsVirtualKeyCode: mk.keyCode,
			});
		}
		Cypress.log({ name: "realPress", message: combo });
	});
}
