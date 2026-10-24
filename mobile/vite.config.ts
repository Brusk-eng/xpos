import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

// Separate entry from the browser POS (../frontend); that build is untouched.
export default defineConfig({
	base: "./",
	publicDir: path.resolve(import.meta.dirname, "../frontend/public"),
	plugins: [vue()],
	resolve: {
		alias: {
			"@mobile": path.resolve(import.meta.dirname, "src"),
			"@": path.resolve(import.meta.dirname, "../frontend/src"),
		},
		dedupe: ["vue", "radix-vue", "clsx", "tailwind-merge", "class-variance-authority"],
	},
	build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 600 },
});
