import { cva, type VariantProps } from "class-variance-authority";

export { default as Card } from "./Card.vue";
export { default as CardContent } from "./CardContent.vue";
export { default as CardDescription } from "./CardDescription.vue";
export { default as CardFooter } from "./CardFooter.vue";
export { default as CardHeader } from "./CardHeader.vue";
export { default as CardTitle } from "./CardTitle.vue";

export const cardVariants = cva("rounded-xl border text-card-foreground", {
	variants: {
		variant: {
			raised: "border-border bg-card shadow-raised",
			flat: "border-border bg-card",
			sunken: "border-border bg-surface-sunken shadow-inset",
			interactive:
				"border-border bg-card shadow-raised cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:border-border-strong hover:shadow-raised-hover active:shadow-pressed motion-safe:active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-selected:border-primary aria-selected:ring-1 aria-selected:ring-primary aria-[current=true]:border-primary",
		},
	},
	defaultVariants: {
		variant: "raised",
	},
});

export type CardVariants = VariantProps<typeof cardVariants>;
