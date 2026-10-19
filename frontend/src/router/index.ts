import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import routes from "./routes";
import { usePosStore } from "@/stores/posStore";

const history = createWebHistory("/xpos");

export const router: Router = createRouter({
	history,
	routes,
});

router.beforeEach(async (to, _from, next) => {
	const authStore = useAuthStore();
	const posStore = usePosStore();

	if (!authStore.isAuthenticated && !authStore.isLoading) {
		await authStore.checkAuth();
	}

	const requiresAuth = to.meta.requiresAuth !== false;
	const isAuthPage = to.meta.isAuthPage === true;

	if (requiresAuth && !authStore.isAuthenticated) {
		next({
			name: "login",
			query: { redirect: to.fullPath },
		});
		return;
	}

	if (isAuthPage && authStore.isAuthenticated) {
		next({ name: "pos" });
		return;
	}

	if (to.name === "cashier" && (!posStore.enableCashierSettlement || !posStore.isCashier)) {
		next({ name: "pos" });
		return;
	}
	if (to.meta.requiresAdmin === true && !authStore.canManagePermissions) {
		next({ name: "pos" });
		return;
	}

	if (to.meta.title) {
		document.title = `${to.meta.title} | X POS`;
	}

	next();
});
