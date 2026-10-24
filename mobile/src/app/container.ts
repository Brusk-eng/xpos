/**
 * Composition root. XPOS Mobile runs only inside the Android (Capacitor) app: every port is backed by the
 * native plugin, and the server session uses the platform HTTP stack and cookie jar.
 */
import { Capacitor } from "@capacitor/core";
import type {
	AuthService,
	CatalogRepository,
	Printer,
	Scanner,
	SyncEngine,
	TransactionStore,
} from "@mobile/ports";
import { FrappeHttpTransport } from "@mobile/adapters/frappeHttp";
import { FrappeOnlineLogin } from "@mobile/adapters/onlineLogin";
import {
	NativeAuth,
	NativeCatalog,
	NativeTransactions,
	NoSync,
	UnsupportedPrinter,
	UnsupportedScanner,
} from "@mobile/adapters/native/nativeAdapters";

export class NotAndroidError extends Error {
	constructor() {
		super("XPOS Mobile runs inside the Android app.");
		this.name = "NotAndroidError";
	}
}

export interface Container {
	catalog: CatalogRepository;
	transactions: TransactionStore;
	auth: AuthService;
	sync: SyncEngine;
	scanner: Scanner;
	printer: Printer;
	/** HTTP session for the configured server. The CSRF token is fetched once per app run, after sign-in or unlock. */
	session(origin: string): Promise<FrappeHttpTransport>;
}

export function createContainer(): Container {
	if (!Capacitor.isNativePlatform()) throw new NotAndroidError();
	const transports = new Map<string, FrappeHttpTransport>();
	const transport = (origin: string) => {
		let t = transports.get(origin);
		if (!t)
			transports.set(origin, (t = new FrappeHttpTransport(origin, (u, i) => fetch(u, i), "native")));
		return t;
	};
	return {
		catalog: new NativeCatalog(),
		transactions: new NativeTransactions(),
		auth: new NativeAuth(new FrappeOnlineLogin((origin) => transport(origin))),
		sync: new NoSync("native"),
		scanner: new UnsupportedScanner(),
		printer: new UnsupportedPrinter(),
		session: async (origin) => {
			const t = transport(origin);
			await t.refreshCsrf(); // throws SessionExpiredError when the cookie session is gone
			return t;
		},
	};
}
