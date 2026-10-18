/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.{vue,js,ts,jsx,tsx}"],
	darkMode: "class",
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: { "2xl": "1400px" },
		},
		extend: {
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
					soft: "hsl(var(--destructive-soft))",
					"soft-foreground": "hsl(var(--destructive-soft-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				"border-strong": "hsl(var(--border-strong))",
				focus: "hsl(var(--focus))",
				surface: {
					raised: "hsl(var(--surface-raised))",
					sunken: "hsl(var(--surface-sunken))",
					hover: "hsl(var(--surface-hover))",
					pressed: "hsl(var(--surface-pressed))",
					selected: "hsl(var(--surface-selected))",
					"selected-foreground": "hsl(var(--surface-selected-foreground))",
					inverse: "hsl(var(--surface-inverse))",
					"inverse-foreground": "hsl(var(--surface-inverse-foreground))",
				},
				success: {
					DEFAULT: "hsl(var(--success))",
					foreground: "hsl(var(--success-foreground))",
					soft: "hsl(var(--success-soft))",
					"soft-foreground": "hsl(var(--success-soft-foreground))",
				},
				warning: {
					DEFAULT: "hsl(var(--warning))",
					foreground: "hsl(var(--warning-foreground))",
					soft: "hsl(var(--warning-soft))",
					"soft-foreground": "hsl(var(--warning-soft-foreground))",
				},
				info: {
					DEFAULT: "hsl(var(--info))",
					foreground: "hsl(var(--info-foreground))",
					soft: "hsl(var(--info-soft))",
					"soft-foreground": "hsl(var(--info-soft-foreground))",
				},
				scrim: "hsl(var(--scrim))",
			},
			fontFamily: {
				sans: [
					"Inter",
					"system-ui",
					"-apple-system",
					"BlinkMacSystemFont",
					"Segoe UI",
					"Roboto",
					"sans-serif",
				],
				mono: ["JetBrains Mono", "Fira Code", "monospace"],
			},
			borderRadius: {
				xl: "calc(var(--radius) + 4px)",
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			boxShadow: {
				soft: "0 2px 15px -3px rgba(0,0,0,0.07), 0 10px 20px -2px rgba(0,0,0,0.04)",
				raised: "var(--shadow-raised)",
				"raised-hover": "var(--shadow-raised-hover)",
				pressed: "var(--shadow-pressed)",
				inset: "var(--shadow-inset)",
				primary: "var(--shadow-primary)",
				overlay: "var(--shadow-overlay)",
			},
			height: {
				control: "var(--control-h)",
				"control-compact": "var(--control-h-compact)",
				"control-touch": "var(--control-h-touch)",
			},
			minHeight: {
				control: "var(--control-h)",
				"control-compact": "var(--control-h-compact)",
				"control-touch": "var(--control-h-touch)",
			},
			width: {
				control: "var(--control-h)",
				"control-compact": "var(--control-h-compact)",
				"control-touch": "var(--control-h-touch)",
			},
			transitionDuration: {
				fast: "var(--duration-fast)",
				base: "var(--duration-base)",
			},
			transitionTimingFunction: {
				standard: "var(--ease-standard)",
			},
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: "0" },
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
};
