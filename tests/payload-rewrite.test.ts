import test from "node:test";
import assert from "node:assert/strict";
import { extractRequestSurface, rewriteMinimalProviderRequest, rewriteProviderRequest } from "../src/adapter/payload-rewrite.ts";
import {
	DSH_BASH_PARAMETERS,
	DSH_STR_REPLACE_EDITOR_PARAMETERS,
	MINIMAL_BASH_DESCRIPTION,
	MINIMAL_PROMPT,
	STR_REPLACE_EDITOR_DESCRIPTION,
} from "../src/dsh/official.ts";

test("rewriteMinimalProviderRequest replaces chat-completions tools and system message", () => {
	const rewritten = rewriteMinimalProviderRequest({
		model: "deepseek-v4-pro",
		messages: [
			{ role: "system", content: "You are Pi, a coding agent with many tools." },
			{ role: "user", content: "hi" },
		],
		tools: [
			{
				type: "function",
				function: {
					name: "read",
					description: "Read a file",
					parameters: { type: "object", properties: {} },
					strict: false,
				},
			},
		],
	});
	const surface = extractRequestSurface(rewritten);
	assert.equal(surface.system, MINIMAL_PROMPT);
	assert.deepEqual(surface.toolNames, ["bash", "str_replace_editor"]);
	assert.deepEqual(surface.tools, [
		{
			type: "function",
			function: {
				name: "bash",
				description: MINIMAL_BASH_DESCRIPTION,
				parameters: DSH_BASH_PARAMETERS,
			},
		},
		{
			type: "function",
			function: {
				name: "str_replace_editor",
				description: STR_REPLACE_EDITOR_DESCRIPTION,
				parameters: DSH_STR_REPLACE_EDITOR_PARAMETERS,
			},
		},
	]);
	assert.equal(JSON.stringify(surface.tools).includes("strict"), false);
	assert.equal(JSON.stringify(surface.tools).includes("additionalProperties"), false);
});

test("rewriteMinimalProviderRequest maps Anthropic-style tool schemas", () => {
	const rewritten = rewriteMinimalProviderRequest({
		system: "Pi default prompt",
		tools: [{ name: "read", description: "x", input_schema: { type: "object" } }],
	});
	assert.equal((rewritten as { system: string }).system, MINIMAL_PROMPT);
	const tools = (rewritten as { tools: Array<{ name: string; input_schema: unknown }> }).tools;
	assert.deepEqual(
		tools.map((tool) => tool.name),
		["bash", "str_replace_editor"],
	);
	assert.deepEqual(tools[0]?.input_schema, DSH_BASH_PARAMETERS);
});

test("does not rewrite compaction summarization payloads", () => {
	const payload = {
		system: "You are a context summarization assistant. Your task is to read a conversation.",
		messages: [
			{
				role: "user",
				content: "<conversation>\nold turn\n</conversation>\n\nSummarize.",
			},
		],
		tools: [{ type: "function", function: { name: "read" } }],
	};
	const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
	assert.equal(rewritten, payload);
	assert.equal((rewritten as { system: string }).system.includes("context summarization assistant"), true);
});

test("does not rewrite a compaction user turn even without the summarization system string", () => {
	const payload = {
		messages: [
			{
				role: "user",
				content: "<conversation>\nhi\n</conversation>\n<previous-summary>\nprior\n</previous-summary>",
			},
		],
	};
	const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
	assert.equal(rewritten, payload);
});

test("promoted Pro can keep AGENTS.md after the official persona", () => {
	const persona = `${MINIMAL_PROMPT}\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="/proj/AGENTS.md">\nUse bun.\n</project_instructions>\n\n</project_context>\n`;
	const rewritten = rewriteProviderRequest(
		{
			system: "Pi default prompt",
			tools: [{ type: "function", function: { name: "read", parameters: { type: "object" } } }],
		},
		{ persona, rewriteTools: false },
	);
	const surface = extractRequestSurface(rewritten);
	assert.ok(surface.system?.startsWith(MINIMAL_PROMPT));
	assert.match(surface.system ?? "", /<project_instructions path="\/proj\/AGENTS\.md">/);
	assert.deepEqual(surface.toolNames, ["read"]);
});

test("promoted Pro rewrites persona but leaves Pi tools", () => {
	const rewritten = rewriteProviderRequest(
		{
			system: "Pi default prompt",
			tools: [
				{ type: "function", function: { name: "read", parameters: { type: "object" } } },
				{ type: "function", function: { name: "bash", parameters: { type: "object" } } },
			],
		},
		{ persona: MINIMAL_PROMPT, rewriteTools: false },
	);
	const surface = extractRequestSurface(rewritten);
	assert.equal(surface.system, MINIMAL_PROMPT);
	assert.deepEqual(surface.toolNames, ["read", "bash"]);
});
