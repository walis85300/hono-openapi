import type { OpenAPIV3_1 } from "openapi-types";

/**
 * Convert an OpenAPI 3.1 spec to a Markdown string optimized for LLM consumption.
 * Follows the `Accept: text/markdown` convention (RFC 7763) used by Cloudflare, Claude Code, and Cursor.
 */
export function specsToMarkdown(specs: OpenAPIV3_1.Document): string {
	const lines: string[] = [];

	// Title and description
	lines.push(`# ${specs.info.title}`);
	lines.push("");
	if (specs.info.description) {
		lines.push(specs.info.description);
		lines.push("");
	}
	lines.push(`**Version:** ${specs.info.version}`);
	lines.push("");

	// Contact
	if (specs.info.contact) {
		const { name, url, email } = specs.info.contact;
		const parts: string[] = [];
		if (name) parts.push(name);
		if (email) parts.push(`<${email}>`);
		if (url) parts.push(url);
		if (parts.length > 0) {
			lines.push(`**Contact:** ${parts.join(" - ")}`);
			lines.push("");
		}
	}

	// License
	if (specs.info.license) {
		const lic = specs.info.license;
		lines.push(
			`**License:** ${lic.url ? `[${lic.name}](${lic.url})` : lic.name}`,
		);
		lines.push("");
	}

	// Servers
	if (specs.servers && specs.servers.length > 0) {
		lines.push("## Servers");
		lines.push("");
		for (const server of specs.servers) {
			lines.push(
				`- \`${server.url}\`${server.description ? ` - ${server.description}` : ""}`,
			);
		}
		lines.push("");
	}

	// Security schemes
	const securitySchemes = specs.components?.securitySchemes;
	if (securitySchemes && Object.keys(securitySchemes).length > 0) {
		lines.push("## Authentication");
		lines.push("");
		for (const [name, scheme] of Object.entries(securitySchemes)) {
			if (isRef(scheme)) continue;
			lines.push(`### ${name}`);
			lines.push("");
			lines.push(`- **Type:** ${scheme.type}`);
			if ("scheme" in scheme && scheme.scheme) {
				lines.push(`- **Scheme:** ${scheme.scheme}`);
			}
			if ("in" in scheme && scheme.in) {
				lines.push(`- **In:** ${scheme.in}`);
			}
			if ("name" in scheme && scheme.name) {
				lines.push(`- **Name:** ${scheme.name}`);
			}
			if (scheme.description) {
				lines.push(`- ${scheme.description}`);
			}
			lines.push("");
		}
	}

	// Group endpoints by tag
	const taggedOps: Record<string, EndpointInfo[]> = {};
	const paths = specs.paths ?? {};

	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem) continue;
		for (const method of HTTP_METHODS) {
			const op = pathItem[method];
			if (!op) continue;

			const tags =
				op.tags && op.tags.length > 0 ? op.tags : ["Default"];
			for (const tag of tags) {
				if (!taggedOps[tag]) taggedOps[tag] = [];
				taggedOps[tag].push({ method: method.toUpperCase(), path, op, pathItem });
			}
		}
	}

	// Render each tag group
	for (const [tag, endpoints] of Object.entries(taggedOps)) {
		lines.push(`## ${tag}`);
		lines.push("");

		// Tag description from specs.tags
		const tagDef = specs.tags?.find((t) => t.name === tag);
		if (tagDef?.description) {
			lines.push(tagDef.description);
			lines.push("");
		}

		for (const { method, path, op } of endpoints) {
			lines.push(`### ${method} \`${path}\``);
			lines.push("");

			if (op.summary) {
				lines.push(op.summary);
				lines.push("");
			}
			if (op.description) {
				lines.push(op.description);
				lines.push("");
			}

			// Parameters
			const params = op.parameters ?? [];
			const resolvedParams = params
				.map((p) => (isRef(p) ? resolveRef(p.$ref, specs) : p))
				.filter(
					(p): p is OpenAPIV3_1.ParameterObject => p != null && !isRef(p),
				);

			if (resolvedParams.length > 0) {
				lines.push("**Parameters:**");
				lines.push("");
				lines.push("| Name | In | Type | Required | Description |");
				lines.push("|------|----|------|----------|-------------|");
				for (const param of resolvedParams) {
					const schema = param.schema
						? isRef(param.schema)
							? param.schema.$ref.split("/").pop() ?? "object"
							: schemaTypeString(param.schema)
						: "string";
					lines.push(
						`| ${param.name} | ${param.in} | ${schema} | ${param.required ? "Yes" : "No"} | ${param.description ?? ""} |`,
					);
				}
				lines.push("");
			}

			// Request body
			if (op.requestBody) {
				const body = isRef(op.requestBody)
					? resolveRef(op.requestBody.$ref, specs)
					: op.requestBody;
				if (body && "content" in body) {
					for (const [mediaType, mediaObj] of Object.entries(
						body.content ?? {},
					)) {
						lines.push(`**Request Body** (\`${mediaType}\`)`);
						lines.push("");
						if (mediaObj.schema) {
							const schema = isRef(mediaObj.schema)
								? resolveRef(mediaObj.schema.$ref, specs)
								: mediaObj.schema;
							if (schema && !isRef(schema)) {
								lines.push(renderSchema(schema, specs));
								lines.push("");
							}
						}
					}
				}
			}

			// Responses
			const responses = op.responses;
			if (responses && Object.keys(responses).length > 0) {
				lines.push("**Responses:**");
				lines.push("");
				for (const [status, resp] of Object.entries(responses)) {
					const response = isRef(resp)
						? resolveRef(resp.$ref, specs)
						: resp;
					if (!response || isRef(response)) continue;

					const desc =
						"description" in response ? response.description : "";
					lines.push(`**${status}** - ${desc}`);
					lines.push("");

					if ("content" in response && response.content) {
						for (const [mediaType, mediaObj] of Object.entries(
							response.content,
						)) {
							if (mediaObj.schema) {
								const schema = isRef(mediaObj.schema)
									? resolveRef(mediaObj.schema.$ref, specs)
									: mediaObj.schema;
								if (schema && !isRef(schema)) {
									lines.push(`Content-Type: \`${mediaType}\``);
									lines.push("");
									lines.push(renderSchema(schema, specs));
									lines.push("");
								}
							}
						}
					}
				}
			}

			lines.push("---");
			lines.push("");
		}
	}

	return lines.join("\n").trimEnd().concat("\n");
}

// --- Internal helpers ---

const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
] as const;

type EndpointInfo = {
	method: string;
	path: string;
	op: OpenAPIV3_1.OperationObject;
	pathItem: OpenAPIV3_1.PathItemObject;
};

function isRef(obj: unknown): obj is OpenAPIV3_1.ReferenceObject {
	return obj != null && typeof obj === "object" && "$ref" in obj;
}

function resolveRef(
	ref: string,
	specs: OpenAPIV3_1.Document,
	visited?: Set<string>,
): Record<string, unknown> | null {
	const seen = visited ?? new Set<string>();
	if (seen.has(ref)) return null;
	seen.add(ref);

	// #/components/schemas/Foo → ["components", "schemas", "Foo"]
	const parts = ref.replace(/^#\//, "").split("/");
	let current: unknown = specs;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return null;
		current = (current as Record<string, unknown>)[part];
	}
	if (current == null || typeof current !== "object") return null;

	// Follow nested $ref
	if ("$ref" in current && typeof (current as Record<string, unknown>).$ref === "string") {
		return resolveRef(
			(current as Record<string, unknown>).$ref as string,
			specs,
			seen,
		);
	}

	return current as Record<string, unknown>;
}

function schemaTypeString(schema: OpenAPIV3_1.SchemaObject): string {
	if (schema.enum) {
		return `enum(${schema.enum.join(", ")})`;
	}
	if (schema.type === "array" && schema.items) {
		const itemType = isRef(schema.items)
			? schema.items.$ref.split("/").pop() ?? "object"
			: schemaTypeString(schema.items);
		return `${itemType}[]`;
	}
	const base = Array.isArray(schema.type)
		? schema.type.join(" | ")
		: schema.type ?? "any";
	return schema.format ? `${base} (${schema.format})` : base;
}

function renderSchema(
	schema: OpenAPIV3_1.SchemaObject,
	specs: OpenAPIV3_1.Document,
	depth = 0,
	visited?: Set<string>,
): string {
	const seen = visited ?? new Set<string>();
	const indent = "  ".repeat(depth);

	// Combinators
	for (const combinator of ["oneOf", "anyOf", "allOf"] as const) {
		const items = schema[combinator];
		if (items && items.length > 0) {
			const label =
				combinator === "oneOf"
					? "One of"
					: combinator === "anyOf"
						? "Any of"
						: "All of";
			const parts = items.map((item, i) => {
				if (isRef(item)) {
					const resolved = resolveRef(item.$ref, specs, new Set(seen));
					if (!resolved || isRef(resolved)) {
						return `${indent}- ${item.$ref.split("/").pop()}`;
					}
					return `${indent}- Option ${i + 1}:\n${renderSchema(resolved as OpenAPIV3_1.SchemaObject, specs, depth + 1, seen)}`;
				}
				return `${indent}- Option ${i + 1}:\n${renderSchema(item, specs, depth + 1, seen)}`;
			});
			return `${indent}${label}:\n${parts.join("\n")}`;
		}
	}

	// Object
	if (
		schema.type === "object" ||
		(schema.properties && !schema.type)
	) {
		const lines: string[] = [];
		lines.push(`${indent}\`\`\`json`);
		lines.push(`${indent}{`);
		const props = schema.properties ?? {};
		const required = schema.required ?? [];
		const entries = Object.entries(props);
		for (let i = 0; i < entries.length; i++) {
			const [key, val] = entries[i];
			const resolved = isRef(val)
				? resolveRef(val.$ref, specs, new Set(seen))
				: val;
			const typeStr = resolved && !isRef(resolved)
				? schemaTypeString(resolved as OpenAPIV3_1.SchemaObject)
				: "any";
			const req = required.includes(key) ? " (required)" : "";
			const desc =
				resolved && !isRef(resolved) && "description" in resolved && resolved.description
					? ` // ${resolved.description}`
					: "";
			const comma = i < entries.length - 1 ? "," : "";
			lines.push(`${indent}  "${key}": "${typeStr}${req}"${comma}${desc}`);
		}
		lines.push(`${indent}}`);
		lines.push(`${indent}\`\`\``);
		return lines.join("\n");
	}

	// Array
	if (schema.type === "array" && schema.items) {
		const itemSchema = isRef(schema.items)
			? resolveRef(schema.items.$ref, specs, new Set(seen))
			: schema.items;
		if (itemSchema && !isRef(itemSchema)) {
			const inner = renderSchema(
				itemSchema as OpenAPIV3_1.SchemaObject,
				specs,
				depth,
				seen,
			);
			return `${indent}Array of:\n${inner}`;
		}
		return `${indent}Array`;
	}

	// Primitive
	return `${indent}\`${schemaTypeString(schema)}\``;
}
