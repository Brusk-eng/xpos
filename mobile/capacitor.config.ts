import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.kodlyft.xpos.mobile",
	appName: "XPOS Mobile",
	webDir: "dist",
	android: { allowMixedContent: false, backgroundColor: "#e8ecf2" },
	server: { androidScheme: "https" },
	plugins: { CapacitorHttp: { enabled: true }, CapacitorCookies: { enabled: true } },
};

export default config;
