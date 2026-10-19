import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the Pearl token utilities so consumer overrides (e.g. `h-8`) replace them.
const controlSizes = ["control", "control-compact", "control-touch"];
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			h: [{ h: controlSizes }],
			w: [{ w: controlSizes }],
			"min-h": [{ "min-h": controlSizes }],
			shadow: [
				{ shadow: ["raised", "raised-hover", "pressed", "inset", "primary", "overlay", "soft"] },
			],
			duration: [{ duration: ["fast", "base"] }],
			ease: [{ ease: ["standard"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function initials(name: string | undefined | null): string {
	const words = String(name || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	return (
		words
			.slice(0, 2)
			.map((w) => w[0])
			.join("")
			.toUpperCase() || "?"
	);
}

// Re-export translate function for convenience
export { __, _lt, format, hasTranslation } from "./translate";
