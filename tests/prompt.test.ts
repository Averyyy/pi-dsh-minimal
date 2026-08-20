import test from "node:test";
import assert from "node:assert/strict";
import {
	composeAnchoredPrompt,
	ensurePromotedSurface,
	formatPiDocs,
	formatProjectContext,
	formatSkillsSection,
	isAnchoredSystemPrompt,
	minimalSystemPrompt,
	PI_IDENTITY,
	reanchorPersona,
	resolvePiDocsPaths,
	systemPromptText,
	toolResourcesFromLiveTools,
} from "../src/adapter/prompt.ts";
import { MINIMAL_PROMPT } from "../src/dsh/official.ts";

const liveTools = [
	{ name: "read", description: "Read files", promptGuidelines: ["Use read to inspect files"] },
	{ name: "bash", description: "Run commands", promptGuidelines: ["Use bash for ls, rg, find"] },
	{ name: "write", description: "Write files", promptGuidelines: [] },
];

test("toolResourcesFromLiveTools builds snippets and guidelines from the live catalog", () => {
	const resources = toolResourcesFromLiveTools(liveTools);
	assert.equal(resources.toolSnippets?.["read"], "Read files");
	assert.equal(resources.toolSnippets?.["bash"], "Run commands");
	assert.deepEqual(resources.promptGuidelines, ["Use read to inspect files", "Use bash for ls, rg, find"]);
});

test("toolResourcesFromLiveTools dedupes guidelines and skips empty names", () => {
	const resources = toolResourcesFromLiveTools([
		{ name: "read", description: "R", promptGuidelines: ["g", "g"] },
		{ name: "", description: "No name" },
	] as never);
	assert.deepEqual(resources.promptGuidelines, ["g"]);
	assert.equal("" in (resources.toolSnippets ?? {}), false);
});

test("promoted compose lists live tools instead of \"(none)\" from a sparse bootstrap snapshot", () => {
	// Mirrors the promoted request during the first task: the bootstrap-time
	// snapshot has empty toolSnippets, so a naive re-anchor renders "(none)".
	const prompt = composeAnchoredPrompt({
		toolSnippets: {},
		promptGuidelines: [],
		selectedTools: ["read", "bash", "write"],
		...toolResourcesFromLiveTools(liveTools),
		includeWorkspace: true,
		assembledPrompt: MINIMAL_PROMPT,
	});
	assert.match(prompt, /Available tools:/);
	assert.doesNotMatch(prompt, /\(none\)/);
	assert.match(prompt, /- read: Read files/);
	assert.match(prompt, /- bash: Run commands/);
	assert.match(prompt, /- write: Write files/);
});

const workspace = {
	contextFiles: [
		{ path: "/home/u/.pi/agent/AGENTS.md", content: "Global: be brief." },
		{ path: "/proj/AGENTS.md", content: "Run npm test." },
	],
	skills: [{ name: "pdf", description: "PDF tools", filePath: "/tmp/skills/pdf/SKILL.md" }],
	selectedTools: ["read", "bash", "edit", "write"],
	toolSnippets: { read: "Read a file", bash: "Run a command" },
};

test("bootstrap compose is the official one-liner only", () => {
	const prompt = composeAnchoredPrompt({
		...workspace,
		includeWorkspace: false,
		assembledPrompt: `${PI_IDENTITY}\n\nAvailable tools:\n- read: Read a file`,
	});
	assert.equal(prompt, MINIMAL_PROMPT);
	assert.doesNotMatch(prompt, /<project_context>/);
	assert.doesNotMatch(prompt, /Available tools:/);
});

test("reanchorPersona replaces Pi identity and keeps extension text", () => {
	const assembled = `${PI_IDENTITY}\n\nAvailable tools:\n- bash: Run a command\n\n<hypa-context>keep me</hypa-context>`;
	const reanchored = reanchorPersona(assembled);
	assert.ok(reanchored.startsWith(MINIMAL_PROMPT));
	assert.doesNotMatch(reanchored, /expert coding assistant operating inside pi/);
	assert.match(reanchored, /Available tools:/);
	assert.match(reanchored, /<hypa-context>keep me<\/hypa-context>/);
});

test("reanchorPersona removes a Pi identity reordered behind extension content", () => {
	const assembled = `${MINIMAL_PROMPT}\n\n<available_skills>\n  <skill>keep me</skill>\n</available_skills>\n\n---\n\n${PI_IDENTITY}\n\nAvailable tools:\n- bash: Run a command`;
	const reanchored = reanchorPersona(assembled);
	assert.ok(reanchored.startsWith(MINIMAL_PROMPT));
	assert.equal(reanchored.includes(PI_IDENTITY), false);
	assert.match(reanchored, /<available_skills>/);
	assert.match(reanchored, /Available tools:/);
});

test("promoted compose reanchors Pi's prompt and does not drop other extensions", () => {
	const assembled = `${PI_IDENTITY}\n\nAvailable tools:\n- read: Read a file\n\nPi documentation (read only when the user asks about pi itself):\n- Main documentation: /docs\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n<project_instructions path="/proj/AGENTS.md">\nUse bun.\n</project_instructions>\n\n</project_context>\n\n<hermes-memory>prior note</hermes-memory>`;
	const prompt = composeAnchoredPrompt({
		...workspace,
		includeWorkspace: true,
		assembledPrompt: assembled,
	});
	assert.ok(prompt.startsWith(MINIMAL_PROMPT));
	assert.equal(isAnchoredSystemPrompt(prompt), true);
	assert.match(prompt, /Available tools:/);
	assert.match(prompt, /Pi documentation/);
	assert.match(prompt, /Use bun\./);
	assert.match(prompt, /<hermes-memory>prior note<\/hermes-memory>/);
	assert.equal(prompt.split("<project_context>").length, 2);
});

test("promoted compose fills workspace and docs when the assembled prompt is still the one-liner", () => {
	const prompt = composeAnchoredPrompt({
		...workspace,
		includeWorkspace: true,
		assembledPrompt: MINIMAL_PROMPT,
	});
	assert.ok(prompt.startsWith(MINIMAL_PROMPT));
	assert.match(prompt, /Available tools:/);
	assert.match(prompt, /- read: Read a file/);
	assert.match(prompt, /Pi documentation/);
	assert.match(prompt, /<project_context>/);
	assert.match(prompt, /<available_skills>/);
	assert.match(prompt, /<name>pdf<\/name>/);
});

test("ensurePromotedSurface does not duplicate blocks", () => {
	const once = ensurePromotedSurface(MINIMAL_PROMPT, workspace);
	const twice = ensurePromotedSurface(once, workspace);
	assert.equal(twice.split("<project_context>").length, once.split("<project_context>").length);
	assert.equal(twice.split("<available_skills>").length, once.split("<available_skills>").length);
	assert.equal(twice.split("Pi documentation").length, once.split("Pi documentation").length);
});

test("minimalSystemPrompt stays the official one-liner", () => {
	assert.equal(minimalSystemPrompt(), MINIMAL_PROMPT);
	assert.equal(formatProjectContext([]), "");
	assert.equal(formatSkillsSection([]), "");
});

test("resolvePiDocsPaths returns undefined when the host lacks the docs helpers", () => {
	// oh-my-pi's legacy shim exports neither getReadmePath nor getDocsPath.
	assert.equal(resolvePiDocsPaths({}), undefined);
	assert.equal(resolvePiDocsPaths({ getReadmePath: () => "/r" }), undefined);
	assert.equal(resolvePiDocsPaths({ getDocsPath: () => "/d" }), undefined);
});

test("resolvePiDocsPaths reads the three paths from the host agent", () => {
	const agent = {
		getReadmePath: () => "/readme",
		getDocsPath: () => "/docs",
		getExamplesPath: () => "/examples",
	};
	assert.deepEqual(resolvePiDocsPaths(agent), { readme: "/readme", docs: "/docs", examples: "/examples" });
});

test("formatPiDocs omits the docs block when the host lacks the docs helpers", () => {
	// oh-my-pi degradation: promoted surface must not mention Pi documentation
	// when the host exports none of the three path helpers.
	assert.equal(formatPiDocs({}), "");
	assert.doesNotMatch(formatPiDocs({}), /Pi documentation/);
});

test("systemPromptText normalizes the oh-my-pi string[] form", () => {
	assert.equal(systemPromptText(["a", "b"]), "a\n\nb");
	assert.equal(systemPromptText("single"), "single");
	assert.equal(systemPromptText(undefined), undefined);
	assert.equal(systemPromptText([]), "");
});
