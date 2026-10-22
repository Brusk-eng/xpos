import { call } from "@/services/api";
import { loadPermissions, resetPermissions } from "@/services/userRights";
import { clearSessionData } from "@/services/sessionCleanup";
import { UserSession } from "@/types/pos.types";
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { isOnline, isNetworkError } from "@/utils";

function friendlyMessage(err: unknown, fallback: string): string {
	if (isNetworkError(err)) return "Cannot reach the server. Check your connection and try again.";
	const message = err instanceof Error ? err.message : "";
	if (!message || message.includes("Traceback") || message.startsWith("__")) return fallback;
	return message;
}

export const useAuthStore = defineStore("auth", () => {
	const isLoading = ref(false);
	const isAuthenticated = ref(false);
	const user = ref<UserSession | null>(null);
	const error = ref("");
	const resetEmailSent = ref(false);

	const userName = computed(() => user.value?.user || "Guest");
	const userEmail = computed(() => user.value?.user_email || "");
	const userFullName = computed(() => user.value?.user_fullname || "");
	const isGuest = computed(() => !user.value || user.value.user === "Guest");
	const isSystemManager = computed(() =>
		Boolean((window.xpos?.boot as Record<string, unknown> | undefined)?.xpos_is_system_manager),
	);
	const canManagePermissions = computed(() =>
		Boolean((window.xpos?.boot as Record<string, unknown> | undefined)?.xpos_can_manage_permissions),
	);

	async function checkAuth(): Promise<boolean> {
		try {
			isLoading.value = true;
			error.value = "";

			const response = await call("frappe.auth.get_logged_user");

			if (!response) {
				isAuthenticated.value = false;
				user.value = null;
				return false;
			}
			const loggedUser = response as string;

			if (loggedUser && loggedUser !== "Guest") {
				isAuthenticated.value = true;
				if (window.xpos) {
					const bootUserInfo = xpos?.boot?.user_info[loggedUser] as any;
					user.value = {
						user: loggedUser,
						user_email: bootUserInfo?.email || bootUserInfo?.user_email || loggedUser,
						user_fullname: bootUserInfo?.fullname || bootUserInfo?.user_fullname || loggedUser,
						image: bootUserInfo?.image || "",
					};
				}
				await loadPermissions(loggedUser);
				return true;
			}

			isAuthenticated.value = false;
			user.value = null;
			return false;
		} catch (err) {
			console.error("Auth check failed:", err);
			if (isAuthenticated.value && !isOnline()) {
				return true;
			}
			isAuthenticated.value = false;
			user.value = null;
			return false;
		} finally {
			isLoading.value = false;
		}
	}

	async function login(username: string, password: string): Promise<boolean> {
		try {
			isLoading.value = true;
			error.value = "";

			await call("login", {
				usr: username,
				pwd: password,
			});

			isAuthenticated.value = true;
			user.value = {
				user: username,
				user_email: username,
			};

			await loadPermissions(username);
			return true;
		} catch (err) {
			console.error("Login failed:", err);
			error.value = friendlyMessage(err, "Invalid login credentials.");
			return false;
		} finally {
			isLoading.value = false;
		}
	}

	async function sendResetPasswordEmail(email: string): Promise<boolean> {
		try {
			isLoading.value = true;
			error.value = "";
			resetEmailSent.value = false;

			await call("frappe.core.doctype.user.user.reset_password", { user: email });

			resetEmailSent.value = true;
			return true;
		} catch (err) {
			console.error("Reset password failed:", err);
			error.value = friendlyMessage(err, "Failed to send reset email.");
			return false;
		} finally {
			isLoading.value = false;
		}
	}

	async function logout(): Promise<void> {
		try {
			isLoading.value = true;

			await call("logout");
			await clearSessionData();

			isAuthenticated.value = false;
			user.value = null;
			resetPermissions();

			window.location.href = "/xpos/login";
		} catch (err) {
			console.error("Logout failed:", err);
		} finally {
			isLoading.value = false;
		}
	}

	function clearError(): void {
		error.value = "";
	}

	function $reset(): void {
		isLoading.value = false;
		isAuthenticated.value = false;
		user.value = null;
		error.value = "";
		resetEmailSent.value = false;
		resetPermissions();
	}

	return {
		isLoading,
		isAuthenticated,
		user,
		error,
		resetEmailSent,
		userName,
		userEmail,
		userFullName,
		isGuest,
		isSystemManager,
		canManagePermissions,
		checkAuth,
		login,
		sendResetPasswordEmail,
		logout,
		clearError,
		$reset,
	};
});
