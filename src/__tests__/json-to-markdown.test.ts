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
});
