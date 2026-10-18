import { cva, type VariantProps } from "class-variance-authority";

export { default as Input } from "./Input.vue";

/** Shared recessed field look for Input, NumberInput, Autocomplete and Select triggers. */
export const inputVariants = cva(
	"flex w-full min-w-0 rounded-lg border border-border bg-card px-3 py-1 text-sm text-foreground shadow-inset transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/12 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/25 disabled:cursor-not-allowed disabled:opacity-55 read-only:bg-muted read-only:shadow-none file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
	{
		variants: {
			size: {
				default: "h-control",
				compact: "h-control-compact",
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

export type InputVariants = VariantProps<typeof inputVariants>;
