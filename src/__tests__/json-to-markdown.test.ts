import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { jsonToMarkdown, markdownResponse } from "../json-to-markdown.js";

describe("jsonToMarkdown", () => {
	it("should render array of objects as table", () => {
		const data = [
			{ name: "Ana", age: 28, city: "CDMX" },
			{ name: "Luis", age: 32, city: "GDL" },
		];
		const md = jsonToMarkdown(data);

		expect(md).toContain("| name | age | city |");
		expect(md).toContain("| --- | --- | --- |");
		expect(md).toContain("| Ana | 28 | CDMX |");
		expect(md).toContain("| Luis | 32 | GDL |");
	});

	it("should handle objects with different keys across rows", () => {
		const data = [
			{ name: "Ana", age: 28 },
			{ name: "Luis", email: "luis@test.com" },
		];
		const md = jsonToMarkdown(data);

		expect(md).toContain("| name | age | email |");
		expect(md).toContain("| Ana | 28 | - |");
		expect(md).toContain("| Luis | - | luis@test.com |");
	});

	it("should render flat object as key-value list", () => {
		const data = { name: "Ana", age: 28, active: true };
		const md = jsonToMarkdown(data);

		expect(md).toContain("- **name:** Ana");
		expect(md).toContain("- **age:** 28");
		expect(md).toContain("- **active:** Yes");
	});

	it("should render wrapper object with data array as sections", () => {
		const data = {
			total: 2,
			page: 1,
			data: [
				{ id: 1, name: "Ana" },
				{ id: 2, name: "Luis" },
			],
		};
		const md = jsonToMarkdown(data);

		expect(md).toContain("- **total:** 2");
		expect(md).toContain("- **page:** 1");
		expect(md).toContain("## Data");
		expect(md).toContain("| id | name |");
		expect(md).toContain("| 1 | Ana |");
	});

	it("should render primitives as plain text", () => {
		expect(jsonToMarkdown("hello")).toBe("hello");
		expect(jsonToMarkdown(42)).toBe("42");
		expect(jsonToMarkdown(true)).toBe("true");
	});

	it("should handle null and undefined", () => {
		expect(jsonToMarkdown(null)).toBe("");
		expect(jsonToMarkdown(undefined)).toBe("");
	});

	it("should render empty array", () => {
		expect(jsonToMarkdown([])).toBe("*Empty list*");
	});

	it("should render empty object", () => {
		expect(jsonToMarkdown({})).toBe("*Empty object*");
	});

	it("should render array of primitives as bullet list", () => {
		const md = jsonToMarkdown(["apple", "banana", "cherry"]);
		expect(md).toContain("- apple");
		expect(md).toContain("- banana");
		expect(md).toContain("- cherry");
	});

	it("should handle nested objects in table cells", () => {
		const data = [
			{ name: "Ana", address: { city: "CDMX", zip: "06600" } },
		];
		const md = jsonToMarkdown(data);

		expect(md).toContain("| name | address |");
		expect(md).toContain("Ana");
		// nested object should be inline JSON in cell
		expect(md).toContain('{"city":"CDMX","zip":"06600"}');
	});

	it("should render nested object sections", () => {
		const data = {
			user: { name: "Ana", age: 28 },
			settings: { theme: "dark", lang: "es" },
		};
		const md = jsonToMarkdown(data);

		expect(md).toContain("## User");
		expect(md).toContain("- **name:** Ana");
		expect(md).toContain("## Settings");
		expect(md).toContain("- **theme:** dark");
	});

	it("should format camelCase and snake_case headings", () => {
		const data = {
			userName: "test",
			user_settings: { a: 1 },
		};
		const md = jsonToMarkdown(data);

		expect(md).toContain("## User Settings");
	});

	it("should handle null values in objects", () => {
		const data = { name: "Ana", email: null };
		const md = jsonToMarkdown(data);

		expect(md).toContain("- **name:** Ana");
		expect(md).toContain("- **email:** -");
	});

	it("should escape pipe characters in table cells", () => {
		const data = [{ value: "a|b|c" }];
		const md = jsonToMarkdown(data);

		expect(md).toContain("a\\|b\\|c");
	});

	it("should handle boolean values as Yes/No in key-value list", () => {
		const data = { active: true, deleted: false };
		const md = jsonToMarkdown(data);

		expect(md).toContain("- **active:** Yes");
		expect(md).toContain("- **deleted:** No");
	});

	it("should handle deeply nested wrapper pattern", () => {
		const data = {
			status: "success",
			meta: { page: 1, total: 50 },
			results: [
				{ id: 1, title: "First" },
				{ id: 2, title: "Second" },
			],
		};
		const md = jsonToMarkdown(data);

		expect(md).toContain("- **status:** success");
		expect(md).toContain("## Meta");
		expect(md).toContain("- **page:** 1");
		expect(md).toContain("## Results");
		expect(md).toContain("| id | title |");
		expect(md).toContain("| 1 | First |");
	});

	it("should handle empty nested arrays", () => {
		const data = { items: [] };
		const md = jsonToMarkdown(data);

		expect(md).toContain("## Items");
		expect(md).toContain("*Empty list*");
	});
});

describe("jsonToMarkdown edge cases", () => {
	// --- Data shape edge cases ---

	it("should handle array of empty objects", () => {
		const md = jsonToMarkdown([{}, {}, {}]);
		expect(md).toBe("*Empty table*");
	});

	it("should handle array of arrays (jagged 2D)", () => {
		const data = [
			[1, 2, 3],
			[4, null, 6],
			[7, 8],
		];
		const md = jsonToMarkdown(data);
		// Not all objects, not all primitives → mixed numbered items
		expect(md).toContain("**1.**");
		expect(md).toContain("- 1\n- 2\n- 3");
	});

	it("should handle mixed-type array", () => {
		const data = [1, "two", { key: "val" }, [3, 4], true];
		const md = jsonToMarkdown(data);
		expect(md).toContain("**1.**");
		expect(md).toContain("**3.**");
		expect(md).toContain("- **key:** val");
	});

	it("should handle single-item array with nested object", () => {
		const data = [
			{
				id: "usr_01",
				profile: { name: "Alice", bio: "Engineer" },
				settings: { theme: "dark" },
			},
		];
		const md = jsonToMarkdown(data);
		// Single row table — still renders as table
		expect(md).toContain("| id | profile | settings |");
	});

	it("should distinguish falsy values in table cells (null vs 0 vs false vs empty string)", () => {
		const data = [
			{ a: null, b: "", c: 0, d: false },
			{ a: "real", b: "real", c: 1, d: true },
		];
		const md = jsonToMarkdown(data);
		expect(md).toContain("| - |  | 0 | false |");
		expect(md).toContain("| real | real | 1 | true |");
	});

	it("should handle object with only null value", () => {
		expect(jsonToMarkdown({ status: null })).toBe("- **status:** -");
	});

	it("should handle array of nulls", () => {
		const md = jsonToMarkdown([null, null, null]);
		// All primitives → bullet list
		expect(md).toContain("- null");
	});

	it("should handle numeric-string keys that look like array indices", () => {
		const data = { "0": "zero", "1": "one", length: 3 };
		const md = jsonToMarkdown(data);
		expect(md).toContain("- **0:** zero");
		expect(md).toContain("- **1:** one");
		expect(md).toContain("- **length:** 3");
	});

	it("should handle deeply nested single-key objects", () => {
		const data = { a: { b: { c: { d: "deep" } } } };
		const md = jsonToMarkdown(data);
		expect(md).toContain("## A");
		expect(md).toContain("## B");
		expect(md).toContain("deep");
	});

	it("should handle polymorphic array (different key sets per row)", () => {
		const data = [
			{ type: "PushEvent", payload: { size: 3 } },
			{ type: "IssueEvent", payload: { action: "opened", number: 42 } },
		];
		const md = jsonToMarkdown(data);
		expect(md).toContain("| type | payload |");
		expect(md).toContain("PushEvent");
		expect(md).toContain("IssueEvent");
	});

	// --- Markdown injection / special characters ---

	it("should escape pipe characters in table header keys", () => {
		const data = [{ "col|one": "val", normal: "ok" }];
		const md = jsonToMarkdown(data);
		// Header must escape pipes too
		expect(md).not.toContain("| col|one |");
		expect(md).toContain("col\\|one");
	});

	it("should escape newlines in table header keys", () => {
		const data = [{ "line1\nline2": "val" }];
		const md = jsonToMarkdown(data);
		// Header row must not contain raw newline within the key
		expect(md).toContain("| line1 line2 |");
		expect(md.split("\n").length).toBe(3); // header, separator, data row
	});

	it("should handle values containing markdown heading syntax", () => {
		const data = { title: "# OVERRIDE", note: "## Section" };
		const md = jsonToMarkdown(data);
		// Values should be inline, not render as actual headings
		expect(md).toContain("- **title:** # OVERRIDE");
	});

	it("should handle values containing code fences", () => {
		const data = { code: "```\nrm -rf /\n```" };
		const md = jsonToMarkdown(data);
		// Should not break key-value rendering
		expect(md).toContain("- **code:**");
	});

	it("should escape newlines in key-value list values", () => {
		const data = { description: "line one\nline two\nline three" };
		const md = jsonToMarkdown(data);
		// Newlines in values break the list item format
		const lines = md.split("\n");
		// Should be a single list item, not broken across lines
		expect(lines[0]).toContain("- **description:**");
		expect(lines[0]).toContain("line one");
		expect(lines[0]).toContain("line two");
	});

	it("should handle HTML in values (passthrough, not execute)", () => {
		const data = [{ name: "<script>alert(1)</script>" }];
		const md = jsonToMarkdown(data);
		expect(md).toContain("<script>alert(1)</script>");
	});

	it("should handle keys with markdown bold syntax", () => {
		const data = { "**bold**": "value", normal: "ok" };
		const md = jsonToMarkdown(data);
		// Should still render, even if formatting looks weird
		expect(md).toContain("**bold**");
	});

	it("should handle Unicode: RTL, zero-width, emoji sequences", () => {
		const data = [
			{
				arabic: "مرحبا",
				emoji: "👨‍👩‍👧‍👦",
				combining: "e\u0301",
				zeroWidth: "hel\u200Blo",
			},
		];
		const md = jsonToMarkdown(data);
		expect(md).toContain("| arabic | emoji | combining | zeroWidth |");
		expect(md).toContain("مرحبا");
		expect(md).toContain("👨‍👩‍👧‍👦");
	});

	it("should handle empty string key", () => {
		const data = { "": "empty key", normal: "ok" };
		const md = jsonToMarkdown(data);
		expect(md).toContain("- **:** empty key");
	});

	// --- Number edge cases ---

	it("should handle number edge cases", () => {
		const data = {
			large: 9007199254740993,
			tiny: 5e-324,
			negative: -0,
		};
		const md = jsonToMarkdown(data);
		expect(md).toContain("- **large:**");
		expect(md).toContain("- **tiny:**");
	});

	// --- Real API patterns ---

	it("should handle GraphQL connection pattern (edges/node)", () => {
		const data = {
			data: {
				users: {
					edges: [
						{ node: { id: 1, name: "Alice" } },
						{ node: { id: 2, name: "Bob" } },
					],
					pageInfo: { hasNextPage: true, endCursor: "abc" },
				},
			},
		};
		const md = jsonToMarkdown(data);
		expect(md).toContain("## Data");
		expect(md).toContain("node");
	});

	it("should handle Stripe-like paginated response", () => {
		const data = {
			object: "list",
			has_more: true,
			data: [
				{ id: "ch_1", amount: 2000, currency: "usd" },
				{ id: "ch_2", amount: 500, currency: "eur" },
			],
		};
		const md = jsonToMarkdown(data);
		expect(md).toContain("- **object:** list");
		expect(md).toContain("- **has_more:** Yes");
		expect(md).toContain("## Data");
		expect(md).toContain("| id | amount | currency |");
	});

	it("should handle RFC 7807 error response", () => {
		const data = {
			type: "https://example.com/errors/validation",
			title: "Validation Failed",
			status: 422,
			errors: {
				email: ["must be valid", "already taken"],
				password: ["too short"],
			},
		};
		const md = jsonToMarkdown(data);
		expect(md).toContain("- **status:** 422");
		expect(md).toContain("## Errors");
	});

	it("should handle null-heavy sparse data", () => {
		const data = [
			{
				id: "001",
				name: "Acme",
				phone: null,
				fax: null,
				website: null,
				revenue: 5000000,
				rating: null,
			},
		];
		const md = jsonToMarkdown(data);
		expect(md).toContain("| 001 | Acme | - | - | - | 5000000 | - |");
	});
});

describe("markdownResponse middleware", () => {
	it("should convert JSON to markdown when Accept: text/markdown", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/users", (c) =>
			c.json([
				{ name: "Ana", age: 28 },
				{ name: "Luis", age: 32 },
			]),
		);

		const res = await app.request("/users", {
			headers: { Accept: "text/markdown" },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
		const body = await res.text();
		expect(body).toContain("| name | age |");
		expect(body).toContain("| Ana | 28 |");
	});

	it("should return JSON when Accept is not text/markdown", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/users", (c) => c.json([{ name: "Ana" }]));

		const res = await app.request("/users", {
			headers: { Accept: "application/json" },
		});

		expect(res.headers.get("Content-Type")).toContain("application/json");
		const body = await res.json();
		expect(body).toEqual([{ name: "Ana" }]);
	});

	it("should return JSON when no Accept header", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/users", (c) => c.json({ message: "hello" }));

		const res = await app.request("/users");

		expect(res.headers.get("Content-Type")).toContain("application/json");
	});

	it("should not touch non-JSON responses", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/html", (c) => c.html("<h1>Hello</h1>"));

		const res = await app.request("/html", {
			headers: { Accept: "text/markdown" },
		});

		expect(res.headers.get("Content-Type")).toContain("text/html");
	});

	it("should handle quality factors in Accept header", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/data", (c) => c.json({ status: "ok" }));

		const res = await app.request("/data", {
			headers: { Accept: "text/markdown;q=1.0, text/html;q=0.7" },
		});

		expect(res.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
		const body = await res.text();
		expect(body).toContain("- **status:** ok");
	});

	it("should preserve response status code", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.post("/users", (c) => c.json({ id: 1, name: "Ana" }, 201));

		const res = await app.request("/users", {
			method: "POST",
			headers: { Accept: "text/markdown" },
		});

		expect(res.status).toBe(201);
		const body = await res.text();
		expect(body).toContain("- **id:** 1");
	});

	it("should work with wrapper pattern responses", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/users", (c) =>
			c.json({
				total: 2,
				data: [
					{ id: 1, name: "Ana" },
					{ id: 2, name: "Luis" },
				],
			}),
		);

		const res = await app.request("/users", {
			headers: { Accept: "text/markdown" },
		});

		const body = await res.text();
		expect(body).toContain("- **total:** 2");
		expect(body).toContain("## Data");
		expect(body).toContain("| id | name |");
	});

	it("should preserve CORS and custom headers when converting", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/api", (c) => {
			c.header("Access-Control-Allow-Origin", "*");
			c.header("X-Request-Id", "req-123");
			c.header("Cache-Control", "max-age=60");
			return c.json({ status: "ok" });
		});

		const res = await app.request("/api", {
			headers: { Accept: "text/markdown" },
		});

		expect(res.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("X-Request-Id")).toBe("req-123");
		expect(res.headers.get("Cache-Control")).toBe("max-age=60");
	});

	it("should handle 204 No Content with empty body", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.delete("/item", (c) => {
			return c.body(null, 204);
		});

		const res = await app.request("/item", {
			method: "DELETE",
			headers: { Accept: "text/markdown" },
		});

		expect(res.status).toBe(204);
	});

	it("should NOT convert on Accept: */* (wildcard)", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/data", (c) => c.json({ name: "test" }));

		const res = await app.request("/data", {
			headers: { Accept: "*/*" },
		});

		expect(res.headers.get("Content-Type")).toContain("application/json");
	});

	it("should NOT convert on Accept: text/*", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/data", (c) => c.json({ name: "test" }));

		const res = await app.request("/data", {
			headers: { Accept: "text/*" },
		});

		expect(res.headers.get("Content-Type")).toContain("application/json");
	});

	it("should handle error responses (4xx/5xx) with JSON bodies", async () => {
		const app = new Hono();
		app.use(markdownResponse());
		app.get("/fail", (c) =>
			c.json({ error: "not found", code: 404 }, 404),
		);

		const res = await app.request("/fail", {
			headers: { Accept: "text/markdown" },
		});

		expect(res.status).toBe(404);
		const body = await res.text();
		expect(body).toContain("- **error:** not found");
		expect(body).toContain("- **code:** 404");
	});
});
