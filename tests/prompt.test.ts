import test from "node:test";
import assert from "node:assert/strict";
import {
	composeAnchoredPrompt,
	ensurePromotedSurface,
	formatProjectContext,
	formatSkillsSection,
	isAnchoredSystemPrompt,
	minimalSystemPrompt,
	PI_IDENTITY,
	reanchorPersona,
} from "../src/adapter/prompt.ts";
import { MINIMAL_PROMPT } from "../src/dsh/official.ts";

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
