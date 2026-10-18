import { computed, type Ref } from "vue";
import type { ItemGroup } from "@/types/pos.types";

export const ALL_GROUPS = "All Item Groups";

export interface CategoryNode {
	name: string;
	parent: string | null;
}

/**
 * Item-group tree built from `get_item_groups` (leaf `groups` + `parent_groups`).
 *
 * A node whose parent isn't in the set is a root: that covers both the full tree under
 * "All Item Groups" and a POS Profile restricted to a few groups, where the endpoint
 * returns the allowed groups plus their leaves but not the groups in between.
 */
export function buildCategoryTree(groups: ItemGroup[], parentGroups: ItemGroup[]) {
	const byName = new Map<string, CategoryNode>();
	for (const group of [...parentGroups, ...groups]) {
		if (!group?.name || group.name === ALL_GROUPS || byName.has(group.name)) continue;
		byName.set(group.name, { name: group.name, parent: group.parent_item_group || null });
	}

	const children = new Map<string, string[]>();
	for (const node of byName.values()) {
		const key = node.parent && byName.has(node.parent) ? node.parent : ALL_GROUPS;
		if (!children.has(key)) children.set(key, []);
		children.get(key)!.push(node.name);
	}

	function childrenOf(name: string): string[] {
		return children.get(name) || [];
	}

	/** Ancestors from the top level down to `name`, excluding "All Item Groups". */
	function pathTo(name: string): string[] {
		const path: string[] = [];
		const seen = new Set<string>();
		let current = byName.get(name);
		while (current && !seen.has(current.name)) {
			seen.add(current.name);
			path.unshift(current.name);
			current = current.parent ? byName.get(current.parent) : undefined;
		}
		return path;
	}

	/** The level to show as chips: the node's children, or its siblings when it is a leaf. */
	function levelFor(name: string): { parent: string; options: string[] } {
		if (name === ALL_GROUPS || !byName.has(name))
			return { parent: ALL_GROUPS, options: childrenOf(ALL_GROUPS) };
		const own = childrenOf(name);
		if (own.length) return { parent: name, options: own };
		const path = pathTo(name);
		const parent = path.length > 1 ? path[path.length - 2] : ALL_GROUPS;
		return { parent, options: childrenOf(parent) };
	}

	function search(query: string, label: (name: string) => string, limit = 50): string[] {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const results: string[] = [];
		for (const name of byName.keys()) {
			if (name.toLowerCase().includes(q) || label(name).toLowerCase().includes(q)) {
				results.push(name);
				if (results.length >= limit) break;
			}
		}
		return results;
	}

	return {
		size: byName.size,
		has: (name: string) => byName.has(name),
		childrenOf,
		pathTo,
		levelFor,
		search,
	};
}

export function useCategoryTree(groups: Ref<ItemGroup[]>, parentGroups: Ref<ItemGroup[]>) {
	return computed(() => buildCategoryTree(groups.value, parentGroups.value));
}
