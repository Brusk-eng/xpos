import { call } from "@/services/api";
import { __ } from "@/lib/utils";
import { formatWithSymbol } from "@/composables/useCurrency";
import { formatFloat, formatInt } from "@/utils/numberFormat";

export type ReportCategory = "Inventory" | "Sales" | "Purchasing" | "Operations" | "Accounting" | "Other";
export type ReportCapabilityState = "supported" | "adapter_required" | "unsupported";
export type ReportFilterType = "link" | "multi-link" | "date" | "integer" | "float" | "select" | "text";

export interface ReportFilterOption {
	label: string;
	value: string;
}

export interface ReportFilterDefinition {
	fieldname: string;
	label: string;
	type: ReportFilterType;
	required?: boolean;
	doctype?: string;
	placeholder?: string;
	helpText?: string;
	defaultValue?: string | number | string[];
	options?: ReportFilterOption[];
	getQueryFilters?: Record<string, unknown>;
	clears?: string[];
}

export interface ReportDefinition {
	id: string;
	slug: string;
	aliases: string[];
	title: string;
	description: string;
	category: ReportCategory;
	ref_doctype: string;
	capability: { state: ReportCapabilityState; reasons: string[] };
	export: { allowed: boolean };
	print: { allowed: boolean; thermal: boolean };
}

export interface ReportColumn {
	fieldname: string;
	label: string;
	fieldtype?: string;
	options?: string;
	width?: number;
	precision?: number;
	hidden?: number;
	default?: unknown;
	[key: string]: unknown;
}

export interface ReportSummaryItem {
	label?: string;
	value?: unknown;
	indicator?: string;
	color?: string;
	key?: string;
	[key: string]: unknown;
}

export interface ReportQueryResult {
	columns: ReportColumn[];
	result: Record<string, unknown>[];
	message?: string;
	chart?: unknown;
	report_summary?: ReportSummaryItem[];
	skip_total_row?: number | boolean;
	add_total_row?: number | boolean;
	status?: string | null;
	prepared_report?: boolean;
	[key: string]: unknown;
}

export interface ReportContextDefaults {
	company?: string;
	warehouse?: string;
}

const reportUtilityFields = new Set([
	"indent",
	"parent",
	"lft",
	"rgt",
	"is_total_row",
	"is_subtotal",
	"row_style",
	"__checked",
	"__index",
]);

function cloneValue<T>(value: T): T {
	if (Array.isArray(value)) return [...value] as T;
	if (value && typeof value === "object") return { ...(value as Record<string, unknown>) } as T;
	return value;
}

let catalogRequest: Promise<ReportDefinition[]> | null = null;

export function fetchReportCatalog(force = false): Promise<ReportDefinition[]> {
	if (!catalogRequest || force) {
		catalogRequest = call<ReportDefinition[]>("xpos.api.reports.get_report_catalog")
			.then((rows) => (Array.isArray(rows) ? rows : []))
			.catch((error) => {
				catalogRequest = null;
				throw error;
			});
	}
	return catalogRequest;
}

export function resetReportCatalog(): void {
	catalogRequest = null;
}

/** Match a URL segment against a report's canonical id, slug or any alias. */
export function findReportDefinition(
	reports: ReportDefinition[],
	identifier: string | string[] | undefined,
): ReportDefinition | undefined {
	if (!identifier || Array.isArray(identifier)) return undefined;
	return reports.find(
		(report) =>
			report.id === identifier || report.slug === identifier || report.aliases.includes(identifier),
	);
}

export function isReportRunnable(report: ReportDefinition): boolean {
	return report.capability.state === "supported";
}

export function buildInitialReportFilters(
	filters: ReportFilterDefinition[],
	context: ReportContextDefaults = {},
): Record<string, unknown> {
	const state: Record<string, unknown> = {};

	for (const filter of filters) {
		state[filter.fieldname] = cloneValue(filter.defaultValue ?? (filter.type === "multi-link" ? [] : ""));
	}

	if (context.company && Object.prototype.hasOwnProperty.call(state, "company")) {
		state.company = context.company;
	}

	if (context.warehouse && Object.prototype.hasOwnProperty.call(state, "warehouse")) {
		state.warehouse = context.warehouse;
	}

	return state;
}

export function normalizeReportFilters(
	filters: ReportFilterDefinition[],
	values: Record<string, unknown>,
): Record<string, unknown> {
	const payload: Record<string, unknown> = {};

	for (const filter of filters) {
		const rawValue = values[filter.fieldname];

		if (rawValue === undefined || rawValue === null || rawValue === "") {
			continue;
		}

		if (Array.isArray(rawValue)) {
			const cleaned = rawValue.map((item) => String(item).trim()).filter(Boolean);
			if (cleaned.length > 0) {
				payload[filter.fieldname] = cleaned;
			}
			continue;
		}

		if (filter.type === "integer") {
			const parsed = Number.parseInt(String(rawValue), 10);
			if (!Number.isNaN(parsed)) payload[filter.fieldname] = parsed;
			continue;
		}

		if (filter.type === "float") {
			const parsed = Number.parseFloat(String(rawValue));
			if (!Number.isNaN(parsed)) payload[filter.fieldname] = parsed;
			continue;
		}

		payload[filter.fieldname] = String(rawValue).trim();
	}

	return payload;
}

export function hydrateReportFiltersFromQuery(
	filters: ReportFilterDefinition[],
	query: Record<string, string | string[] | null | undefined>,
): Record<string, unknown> {
	const hydrated = buildInitialReportFilters(filters);

	for (const filter of filters) {
		const queryValue = query[filter.fieldname];
		if (queryValue === undefined || queryValue === null || queryValue === "") {
			continue;
		}

		if (filter.type === "multi-link") {
			if (Array.isArray(queryValue)) {
				hydrated[filter.fieldname] = queryValue.map((item) => String(item)).filter(Boolean);
			} else {
				hydrated[filter.fieldname] = String(queryValue)
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean);
			}
			continue;
		}

		if (filter.type === "integer") {
			const parsed = Number.parseInt(Array.isArray(queryValue) ? queryValue[0] : queryValue, 10);
			if (!Number.isNaN(parsed)) hydrated[filter.fieldname] = parsed;
			continue;
		}

		if (filter.type === "float") {
			const parsed = Number.parseFloat(Array.isArray(queryValue) ? queryValue[0] : queryValue);
			if (!Number.isNaN(parsed)) hydrated[filter.fieldname] = parsed;
			continue;
		}

		hydrated[filter.fieldname] = Array.isArray(queryValue) ? queryValue[0] : String(queryValue);
	}

	return hydrated;
}

export function serializeReportFiltersToQuery(
	filters: ReportFilterDefinition[],
	values: Record<string, unknown>,
): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	const normalized = normalizeReportFilters(filters, values);

	for (const [fieldname, value] of Object.entries(normalized)) {
		if (Array.isArray(value)) {
			if (value.length > 0) {
				query[fieldname] = value.map((item) => String(item));
			}
			continue;
		}

		if (value === null || value === undefined || value === "") {
			continue;
		}

		query[fieldname] = String(value);
	}

	return query;
}

export function resolveReportLinkFilters(
	filter: ReportFilterDefinition,
	values: Record<string, unknown>,
): Record<string, unknown> {
	if (!filter.getQueryFilters) return {};
	const resolved: Record<string, unknown> = {};
	for (const [key, raw] of Object.entries(filter.getQueryFilters)) {
		if (typeof raw === "string" && raw.startsWith("$")) {
			resolved[key] = values[raw.slice(1)];
		} else {
			resolved[key] = raw;
		}
	}
	return resolved;
}

export function getVisibleReportColumns(columns: ReportColumn[]): ReportColumn[] {
	return columns.filter(
		(column) => !reportUtilityFields.has(column.fieldname) && !String(column.fieldname).startsWith("_"),
	);
}

export function isReportNumericColumn(column: ReportColumn): boolean {
	return ["Currency", "Float", "Int", "Percent", "Check"].includes(String(column.fieldtype || ""));
}

export function isReportTotalRow(row: Record<string, unknown>): boolean {
	return Boolean(row.is_total_row || row.is_subtotal || row._is_total_row);
}

export function normalizeReportRows(
	columns: ReportColumn[],
	result: unknown[],
	options: { addTotalRow?: boolean | number; skipTotalRow?: boolean | number } = {},
): Record<string, unknown>[] {
	const lastIndex = result.length - 1;
	const markLastAsTotal = Boolean(options.addTotalRow) && !options.skipTotalRow;

	return result.map((row, index) => {
		let record: Record<string, unknown>;
		if (Array.isArray(row)) {
			record = {};
			columns.forEach((column, columnIndex) => {
				record[column.fieldname] = row[columnIndex];
			});
		} else {
			record = (row as Record<string, unknown>) ?? {};
		}

		if (markLastAsTotal && index === lastIndex) {
			record._is_total_row = 1;
		}

		return record;
	});
}

export function compareReportRows(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
	column: ReportColumn,
): number {
	const leftValue = left[column.fieldname];
	const rightValue = right[column.fieldname];
	const fieldtype = String(column.fieldtype || "");

	if (["Currency", "Float", "Int", "Percent", "Check"].includes(fieldtype)) {
		const leftNumber = Number(leftValue ?? 0);
		const rightNumber = Number(rightValue ?? 0);
		if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) return 0;
		if (Number.isNaN(leftNumber)) return 1;
		if (Number.isNaN(rightNumber)) return -1;
		return leftNumber - rightNumber;
	}

	if (["Date", "Datetime"].includes(fieldtype)) {
		const leftTime = new Date(String(leftValue || "")).getTime();
		const rightTime = new Date(String(rightValue || "")).getTime();
		if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
		if (Number.isNaN(leftTime)) return 1;
		if (Number.isNaN(rightTime)) return -1;
		return leftTime - rightTime;
	}

	return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function escapeDelimited(value: string, delimiter: string): string {
	const needsQuotes = value.includes(delimiter) || value.includes("\n") || value.includes('"');
	const escaped = value.replace(/"/g, '""');
	return needsQuotes ? `"${escaped}"` : escaped;
}

export function buildReportDelimitedRows(
	columns: ReportColumn[],
	rows: Record<string, unknown>[],
	currency: string,
	delimiter: "," | "\t",
): string {
	const header = columns.map((column) => escapeDelimited(column.label, delimiter)).join(delimiter);
	const body = rows.map((row) =>
		columns
			.map((column) =>
				escapeDelimited(formatReportCell(column, row[column.fieldname], currency), delimiter),
			)
			.join(delimiter),
	);
	return [header, ...body].join("\n");
}

function optionalPrecision(column: ReportColumn): number | null {
	const raw = column.precision as number | string | null | undefined;
	if (raw === null || raw === undefined || raw === "") return null;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function columnCurrency(column: ReportColumn): string {
	const options = String(column.options || "").trim();
	return /^[A-Za-z]{3}$/.test(options) ? options.toUpperCase() : "";
}

function formatReportDateTime(value: unknown): string {
	if (!value) return "-";
	const date = new Date(String(value));
	if (Number.isNaN(date.getTime())) return String(value);
	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export function formatReportCell(column: ReportColumn, value: unknown, currency = ""): string {
	if (value === null || value === undefined || value === "") return "-";

	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(", ");
	}

	switch (column.fieldtype) {
		case "Currency": {
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			const cellCurrency = columnCurrency(column) || currency;
			const precision = optionalPrecision(column);
			return formatWithSymbol(cellCurrency, parsed, precision);
		}
		case "Float":
		case "Percent": {
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			const formatted = formatFloat(parsed, optionalPrecision(column));
			return column.fieldtype === "Percent" ? `${formatted}%` : formatted;
		}
		case "Int": {
			const parsed = Number(value ?? 0);
			if (Number.isNaN(parsed)) return String(value);
			return formatInt(Math.trunc(parsed));
		}
		case "Check":
			return value ? __("Yes") : __("No");
		case "Date": {
			const date = new Date(String(value));
			if (Number.isNaN(date.getTime())) return String(value);
			return new Intl.DateTimeFormat(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}).format(date);
		}
		case "Datetime":
			return formatReportDateTime(value);
		default:
			return String(value);
	}
}

export async function fetchReportMeta(reportId: string): Promise<ReportFilterDefinition[]> {
	const response = await call<{ filters: ReportFilterDefinition[] }>("xpos.api.reports.get_report_meta", {
		report: reportId,
	});
	return Array.isArray(response?.filters) ? response.filters : [];
}

export async function fetchReportData(
	reportId: string,
	filters: Record<string, unknown>,
	purpose: "view" | "export" | "print" = "view",
): Promise<ReportQueryResult> {
	return call<ReportQueryResult>("xpos.api.reports.run_report", {
		report: reportId,
		filters: JSON.stringify(filters),
		purpose,
	});
}
