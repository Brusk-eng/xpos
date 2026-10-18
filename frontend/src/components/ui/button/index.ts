import { cva, type VariantProps } from "class-variance-authority";

export { default as Button } from "./Button.vue";

export const buttonVariants = cva(
	"relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium select-none transition-[color,background-color,border-color,box-shadow,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 motion-safe:active:translate-y-px",
	{
		variants: {
			variant: {
				default:
					"border-primary bg-primary text-primary-foreground shadow-primary hover:bg-primary/90 active:shadow-pressed aria-pressed:ring-2 aria-pressed:ring-primary/40",
				destructive:
					"border-destructive bg-destructive text-destructive-foreground shadow-raised hover:bg-destructive/90 active:shadow-pressed",
				outline:
					"border-border bg-surface-raised text-foreground shadow-raised hover:bg-surface-hover hover:shadow-raised-hover active:bg-surface-pressed active:shadow-pressed aria-pressed:border-primary aria-pressed:bg-surface-selected aria-pressed:text-surface-selected-foreground data-[state=on]:border-primary data-[state=on]:bg-surface-selected data-[state=on]:text-surface-selected-foreground",
				secondary:
					"border-border bg-secondary text-secondary-foreground hover:bg-surface-hover active:bg-surface-pressed active:shadow-pressed aria-pressed:border-primary aria-pressed:bg-surface-selected aria-pressed:text-surface-selected-foreground data-[state=on]:border-primary data-[state=on]:bg-surface-selected data-[state=on]:text-surface-selected-foreground",
				ghost: "border-transparent text-foreground hover:bg-surface-hover active:bg-surface-pressed aria-pressed:bg-surface-selected aria-pressed:text-surface-selected-foreground data-[state=on]:bg-surface-selected data-[state=on]:text-surface-selected-foreground",
				link: "border-transparent text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary",
				success:
					"border-success bg-success text-success-foreground shadow-raised hover:bg-success/90 active:shadow-pressed",
			},
			size: {
				default: "h-control px-4",
				sm: "h-control-compact rounded-md px-3",
				lg: "h-11 px-6 text-base",
				xl: "h-12 rounded-xl px-8 text-base font-semibold",
				icon: "h-control w-control",
				"icon-sm": "h-control-compact w-control-compact rounded-md",
				touch: "h-control-touch px-5 text-base",
				"icon-touch": "h-control-touch w-control-touch",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;
