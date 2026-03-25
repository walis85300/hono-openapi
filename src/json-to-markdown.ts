import type { MiddlewareHandler } from "hono";

/**
 * Hono middleware that transparently converts JSON responses to Markdown
 * when the client sends `Accept: text/markdown`.
 *
 * AI agents (Claude Code, Cursor, OpenCode) send this header natively.
 * Markdown is ~80% more token-efficient than JSON for LLM consumption.
 *
 * @example
 * ```ts
 * import { markdownResponse } from "hono-openapi";
 *
 * const app = new Hono();
 * app.use(markdownResponse());
 *
 * app.get("/users", (c) => c.json([{ name: "Ana", age: 28 }]));
 * // GET /users Accept: text/markdown → markdown table
 * // GET /users Accept: application/json → normal JSON
 * ```
 */
export function markdownResponse(): MiddlewareHandler {
	return async (c, next) => {
		await next();

		const accept = c.req.header("Accept") ?? "";
		if (!accept.includes("text/markdown")) return;

		const ct = c.res.headers.get("Content-Type") ?? "";
		if (!ct.includes("application/json")) return;

		let data: unknown;
		try {
			data = await c.res.json();
		} catch {
			return;
		}

		const md = jsonToMarkdown(data);

		c.res = new Response(md, {
			status: c.res.status,
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		});
	};
}

/**
 * Convert arbitrary JSON data to a Markdown string optimized for LLM consumption.
 *
 * Rendering strategy:
 * - Array of objects → Markdown table
 * - Flat object → Key-value list
 * - Mixed object (arrays + scalars) → Sections with headers
 * - Primitives → Plain text
 * - Fallback → JSON code block
 */
export function jsonToMarkdown(data: unknown): string {
	if (data == null) return "";

	if (typeof data !== "object") return String(data);

	if (Array.isArray(data)) return renderArray(data);

	return renderObject(data as Record<string, unknown>);
}

// --- Renderers ---

function renderArray(arr: unknown[]): string {
	if (arr.length === 0) return "*Empty list*";

	// Array of objects → table
	if (arr.every((item) => isPlainObject(item))) {
		return renderTable(arr as Record<string, unknown>[]);
	}

	// Array of primitives → bullet list
	if (arr.every((item) => !isPlainObject(item) && !Array.isArray(item))) {
		return arr.map((item) => `- ${String(item)}`).join("\n");
	}

	// Mixed array → numbered items
	return arr
		.map((item, i) => {
			const rendered = jsonToMarkdown(item);
			return `**${i + 1}.**\n\n${rendered}`;
		})
		.join("\n\n");
}

function renderObject(obj: Record<string, unknown>): string {
	const keys = Object.keys(obj);
	if (keys.length === 0) return "*Empty object*";

	// Check if it's a flat object (all scalar values)
	const isFlat = keys.every((k) => isScalar(obj[k]));
	if (isFlat) {
		return renderKeyValueList(obj);
	}

	// Mixed object: render sections
	return renderSections(obj);
}

function renderTable(rows: Record<string, unknown>[]): string {
	// Collect all unique keys preserving order
	const columns: string[] = [];
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (!columns.includes(key)) columns.push(key);
		}
	}

	if (columns.length === 0) return "*Empty table*";

	const lines: string[] = [];

	// Header
	lines.push(`| ${columns.join(" | ")} |`);
	lines.push(`| ${columns.map(() => "---").join(" | ")} |`);

	// Rows
	for (const row of rows) {
		const cells = columns.map((col) => formatCell(row[col]));
		lines.push(`| ${cells.join(" | ")} |`);
	}

	return lines.join("\n");
}

function renderKeyValueList(obj: Record<string, unknown>): string {
	return Object.entries(obj)
		.map(([key, value]) => `- **${key}:** ${formatValue(value)}`)
		.join("\n");
}

function renderSections(obj: Record<string, unknown>): string {
	const sections: string[] = [];

	// Separate scalars from complex values
	const scalars: [string, unknown][] = [];
	const complex: [string, unknown][] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (isScalar(value)) {
			scalars.push([key, value]);
		} else {
			complex.push([key, value]);
		}
	}

	// Render scalars as key-value list at the top
	if (scalars.length > 0) {
		sections.push(
			scalars
				.map(([key, value]) => `- **${key}:** ${formatValue(value)}`)
				.join("\n"),
		);
	}

	// Render complex values as sections
	for (const [key, value] of complex) {
		const heading = `## ${formatHeading(key)}`;

		if (Array.isArray(value)) {
			if (value.length === 0) {
				sections.push(`${heading}\n\n*Empty list*`);
			} else if (value.every((item) => isPlainObject(item))) {
				sections.push(`${heading}\n\n${renderTable(value as Record<string, unknown>[])}`);
			} else {
				sections.push(`${heading}\n\n${renderArray(value)}`);
			}
		} else if (isPlainObject(value)) {
			const nested = renderObject(value as Record<string, unknown>);
			sections.push(`${heading}\n\n${nested}`);
		} else {
			sections.push(`${heading}\n\n${jsonCodeBlock(value)}`);
		}
	}

	return sections.join("\n\n");
}

// --- Formatters ---

function formatCell(value: unknown): string {
	if (value == null) return "-";
	if (isScalar(value)) return escapeCell(String(value));
	// Complex values in table cells: inline JSON
	return escapeCell(JSON.stringify(value));
}

function formatValue(value: unknown): string {
	if (value == null) return "-";
	if (typeof value === "boolean") return value ? "Yes" : "No";
	return String(value);
}

function formatHeading(key: string): string {
	// "camelCase" → "Camel Case", "snake_case" → "Snake Case"
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeCell(str: string): string {
	return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function isScalar(value: unknown): boolean {
	return (
		value == null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function jsonCodeBlock(data: unknown): string {
	return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}
