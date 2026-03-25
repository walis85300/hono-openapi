import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import z from "zod";
import { generateSpecs, openAPIRouteHandler } from "../handler.js";
import { specsToMarkdown } from "../markdown.js";
import { describeRoute, resolver, validator } from "../middlewares.js";
import "zod-openapi/extend";

describe("specsToMarkdown", () => {
	it("should include API title and version", async () => {
		const app = new Hono().get(
			"/hello",
			describeRoute({
				description: "Say hello",
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json({ message: "hello" }),
		);

		const specs = await generateSpecs(app, {
			documentation: {
				info: { title: "My API", version: "2.0.0" },
			},
		});
		const md = specsToMarkdown(specs);

		expect(md).toContain("# My API");
		expect(md).toContain("**Version:** 2.0.0");
	});

	it("should render servers", async () => {
		const app = new Hono().get(
			"/",
			describeRoute({
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json({}),
		);

		const specs = await generateSpecs(app, {
			documentation: {
				info: { title: "Test", version: "1.0.0" },
				servers: [
					{ url: "https://api.example.com", description: "Production" },
				],
			},
		});
		const md = specsToMarkdown(specs);

		expect(md).toContain("## Servers");
		expect(md).toContain("`https://api.example.com`");
		expect(md).toContain("Production");
	});

	it("should render endpoints with method and path", async () => {
		const app = new Hono()
			.get(
				"/users",
				describeRoute({
					summary: "List users",
					description: "Returns all users",
					responses: { 200: { description: "User list" } },
				}),
				async (c) => c.json([]),
			)
			.post(
				"/users",
				describeRoute({
					summary: "Create user",
					responses: { 201: { description: "Created" } },
				}),
				async (c) => c.json({}),
			);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("### GET `/users`");
		expect(md).toContain("### POST `/users`");
		expect(md).toContain("List users");
		expect(md).toContain("Returns all users");
		expect(md).toContain("Create user");
	});

	it("should render parameters as a table", async () => {
		const app = new Hono().get(
			"/users/:id",
			describeRoute({
				description: "Get user by ID",
				responses: { 200: { description: "OK" } },
			}),
			validator(
				"param",
				z.object({
					id: z.string().openapi({ description: "User ID" }),
				}),
			),
			async (c) => c.json({}),
		);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("**Parameters:**");
		expect(md).toContain("| Name | In | Type | Required | Description |");
		expect(md).toContain("| id | path |");
	});

	it("should render request body schema", async () => {
		const app = new Hono().post(
			"/users",
			describeRoute({
				responses: { 201: { description: "Created" } },
			}),
			validator(
				"json",
				z.object({
					name: z.string(),
					email: z.string(),
				}),
			),
			async (c) => c.json({}),
		);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("**Request Body**");
		expect(md).toContain("`application/json`");
		expect(md).toContain('"name"');
		expect(md).toContain('"email"');
	});

	it("should render response schemas", async () => {
		const app = new Hono().get(
			"/users",
			describeRoute({
				responses: {
					200: {
						description: "Success",
						content: {
							"application/json": {
								schema: resolver(
									z.object({
										users: z.array(z.string()),
									}),
								),
							},
						},
					},
					404: {
						description: "Not found",
					},
				},
			}),
			async (c) => c.json({ users: [] }),
		);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("**Responses:**");
		expect(md).toContain("**200** - Success");
		expect(md).toContain("**404** - Not found");
		expect(md).toContain('"users"');
	});

	it("should group endpoints by tags", async () => {
		const app = new Hono()
			.get(
				"/users",
				describeRoute({
					tags: ["Users"],
					summary: "List users",
					responses: { 200: { description: "OK" } },
				}),
				async (c) => c.json([]),
			)
			.get(
				"/posts",
				describeRoute({
					tags: ["Posts"],
					summary: "List posts",
					responses: { 200: { description: "OK" } },
				}),
				async (c) => c.json([]),
			);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("## Users");
		expect(md).toContain("## Posts");
	});

	it("should use Default tag for untagged endpoints", async () => {
		const app = new Hono().get(
			"/health",
			describeRoute({
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json({ status: "ok" }),
		);

		const specs = await generateSpecs(app);
		const md = specsToMarkdown(specs);

		expect(md).toContain("## Default");
	});

	it("should render authentication schemes", async () => {
		const app = new Hono().get(
			"/",
			describeRoute({ responses: { 200: { description: "OK" } } }),
			async (c) => c.json({}),
		);

		const specs = await generateSpecs(app, {
			documentation: {
				info: { title: "Test", version: "1.0.0" },
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
						},
						apiKey: {
							type: "apiKey",
							in: "header",
							name: "X-API-Key",
						},
					},
				},
			},
		});
		const md = specsToMarkdown(specs);

		expect(md).toContain("## Authentication");
		expect(md).toContain("### bearerAuth");
		expect(md).toContain("**Type:** http");
		expect(md).toContain("**Scheme:** bearer");
		expect(md).toContain("### apiKey");
		expect(md).toContain("**In:** header");
		expect(md).toContain("**Name:** X-API-Key");
	});
});

describe("openAPIRouteHandler content negotiation", () => {
	it("should return markdown when Accept: text/markdown", async () => {
		const app = new Hono();

		app.get(
			"/users",
			describeRoute({
				summary: "List users",
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json([]),
		);

		app.get("/openapi", openAPIRouteHandler(app, {
			documentation: {
				info: { title: "Test API", version: "1.0.0" },
			},
		}));

		const res = await app.request("/openapi", {
			headers: { Accept: "text/markdown" },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
		const body = await res.text();
		expect(body).toContain("# Test API");
		expect(body).toContain("### GET `/users`");
	});

	it("should return JSON by default", async () => {
		const app = new Hono();

		app.get(
			"/users",
			describeRoute({
				summary: "List users",
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json([]),
		);

		app.get("/openapi", openAPIRouteHandler(app, {
			documentation: {
				info: { title: "Test API", version: "1.0.0" },
			},
		}));

		const res = await app.request("/openapi");

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
		const body = await res.json();
		expect(body.info.title).toBe("Test API");
	});

	it("should return JSON when Accept: application/json", async () => {
		const app = new Hono();

		app.get("/openapi", openAPIRouteHandler(app, {
			documentation: {
				info: { title: "Test API", version: "1.0.0" },
			},
		}));

		const res = await app.request("/openapi", {
			headers: { Accept: "application/json" },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("application/json");
	});

	it("should handle text/markdown with quality factors", async () => {
		const app = new Hono();

		app.get("/openapi", openAPIRouteHandler(app, {
			documentation: {
				info: { title: "Test API", version: "1.0.0" },
			},
		}));

		// Cursor-style: text/markdown;q=1.0, text/html;q=0.7
		const res = await app.request("/openapi", {
			headers: { Accept: "text/markdown;q=1.0, text/html;q=0.7" },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe(
			"text/markdown; charset=utf-8",
		);
	});

	it("should cache markdown across requests", async () => {
		const app = new Hono();

		app.get(
			"/users",
			describeRoute({
				summary: "List users",
				responses: { 200: { description: "OK" } },
			}),
			async (c) => c.json([]),
		);

		app.get("/openapi", openAPIRouteHandler(app, {
			documentation: {
				info: { title: "Test API", version: "1.0.0" },
			},
		}));

		const res1 = await app.request("/openapi", {
			headers: { Accept: "text/markdown" },
		});
		const res2 = await app.request("/openapi", {
			headers: { Accept: "text/markdown" },
		});

		const body1 = await res1.text();
		const body2 = await res2.text();
		expect(body1).toBe(body2);
	});
});
