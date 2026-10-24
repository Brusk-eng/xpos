import type { BootstrapInfo } from "@mobile/ports";
import { classifyLoginResponse, supportedVersion, validateServerOrigin } from "@mobile/domain/origin";
import { FrappeHttpTransport, ServerError } from "./frappeHttp";

export class LoginError extends Error {
	constructor(
		readonly code:
			| "bad_origin"
			| "invalid_credentials"
			| "mfa_unsupported"
			| "sso_unsupported"
			| "unsupported_server"
			| "unexpected",
		message: string,
	) {
		super(message);
		this.name = "LoginError";
	}
}

export interface OnlineLogin {
	login(origin: string, user: string, password: string): Promise<BootstrapInfo>;
}

interface BootstrapReply {
	user: string;
	site: string;
	pos_profile: string;
	company: string;
	warehouse: string;
	currency: string;
	minor_digits: number;
	permissions: Record<string, boolean>;
	erpnext_version: string;
	supported: boolean;
	lease_ttl_seconds: number;
	issued_at: number;
}

/** Real Frappe flow: cookie login -> CSRF token -> read-only bootstrap -> ERPNext 16 gate. */
export class FrappeOnlineLogin implements OnlineLogin {
	constructor(private readonly makeTransport: (origin: string) => FrappeHttpTransport) {}

	async login(origin: string, user: string, password: string): Promise<BootstrapInfo> {
		const v = validateServerOrigin(origin);
		if (!v.ok) throw new LoginError("bad_origin", v.reason);
		const t = this.makeTransport(v.origin);
		const r = await t.request("login", { usr: user, pwd: password });
		const outcome = classifyLoginResponse(r.status, r.body);
		switch (outcome.kind) {
			case "ok":
				break;
			case "invalid_credentials":
				throw new LoginError("invalid_credentials", "User name or password is incorrect");
			case "mfa_unsupported":
				throw new LoginError(
					"mfa_unsupported",
					"This account needs a verification code, which the app does not support yet. Use the web POS.",
				);
			case "sso_unsupported":
				throw new LoginError(
					"sso_unsupported",
					"Single sign-on accounts are not supported yet. Use the web POS.",
				);
			default:
				throw new LoginError("unexpected", `Unexpected response from the server (${outcome.detail})`);
		}
		await t.refreshCsrf();
		let b: BootstrapReply;
		try {
			b = await t.call<BootstrapReply>("xpos.api.mobile.bootstrap", {}, { get: true });
		} catch (e) {
			if (e instanceof ServerError && (e.status === 403 || e.status === 404))
				throw new LoginError(
					"unsupported_server",
					"This server does not have XPOS with mobile support, or this user has no POS Profile.",
				);
			throw e;
		}
		if (!b.supported || !supportedVersion(b.erpnext_version))
			throw new LoginError(
				"unsupported_server",
				`ERPNext ${b.erpnext_version} is not supported. XPOS Mobile needs version 16.`,
			);
		return {
			user: b.user,
			site: v.origin,
			profile: b.pos_profile,
			currency: b.currency,
			minorDigits: b.minor_digits,
			erpnextVersion: b.erpnext_version,
			company: b.company,
			warehouse: b.warehouse,
			leaseTtlSeconds: Math.min(b.lease_ttl_seconds, 24 * 3600),
			issuedAt: b.issued_at,
			permissions: b.permissions,
		};
	}
}
