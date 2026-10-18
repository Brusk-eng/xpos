import { cva, type VariantProps } from "class-variance-authority";

export { default as Badge } from "./Badge.vue";

export const badgeVariants = cva(
	"inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap transition-colors duration-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background",
	{
		variants: {
			variant: {
				default: "border-primary bg-primary text-primary-foreground",
				secondary: "border-border bg-secondary text-secondary-foreground",
				destructive: "border-destructive/30 bg-destructive-soft text-destructive-soft-foreground",
				outline: "border-input bg-transparent text-foreground",
				success: "border-success/30 bg-success-soft text-success-soft-foreground",
				warning: "border-warning/30 bg-warning-soft text-warning-soft-foreground",
				info: "border-info/30 bg-info-soft text-info-soft-foreground",
				neutral: "border-border bg-muted text-muted-foreground",
			},
			size: {
				default: "px-2.5 py-0.5 text-xs",
				sm: "px-2 py-px text-xs",
				lg: "px-3 py-1 text-sm",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
