import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import { desiredSurface, resolveAdapterProfile, shouldUseAdapter, syncAdapter } from "../src/adapter/activation.ts";
import { restoreTools, stripOwnedTools } from "../src/adapter/tool-set.ts";
import { emptyPromptResources, type AdapterState } from "../src/adapter/state.ts";

function ctx(id: string, name?: string) {
	return { model: { provider: "opencode-go", id, name } };
}

test("shouldUseAdapter defaults to DeepSeek V4 Pro and V4 Flash", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(shouldUseAdapter(ctx("deepseek-v4-pro", "DeepSeek V4 Pro (New)"), config), true);
	assert.equal(shouldUseAdapter(ctx("deepseek-v4-flash"), config), true);
	assert.equal(shouldUseAdapter(ctx("gpt-5.6-luna"), config), false);
});

test("V4 Flash runs the Pro anchored-standard profile by default (v0.3.1)", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-flash"), config), "pro");
});

test("Flash can be opted out by removing the pattern", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: ["deepseek-v4-pro"] };
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-flash"), config), "inactive");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), config), "inactive");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), { ...config, useOnAllModels: true }), "pro");
});

test("resolveAdapterProfile returns pro for matches, inactive otherwise", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-pro"), config), "pro");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), config), "inactive");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), { ...config, useOnAllModels: true }), "pro");
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-pro"), { ...config, enabled: false }), "inactive");
});

test("shouldUseAdapter honors custom Pro patterns", () => {
	assert.equal(
		shouldUseAdapter(ctx("my-ds-pro"), { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: ["my-ds-pro"] }),
		true,
	);
});

test("desiredSurface is bootstrap then promoted for Pro", () => {
	assert.equal(desiredSurface("pro", false), "bootstrap");
	assert.equal(desiredSurface("pro", true), "promoted");
	assert.equal(desiredSurface("inactive", false), "off");
});

test("restoreTools restores the snapshot and active bootstrap additions", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write", "web_search"], ["bash", "str_replace_editor", "custom"]),
		["read", "bash", "edit", "write", "web_search", "custom"],
	);
});

test("restoreTools preserves a restricted pre-bootstrap selection", () => {
	assert.deepEqual(restoreTools(["bash"], ["bash", "str_replace_editor"]), ["bash"]);
	assert.deepEqual(restoreTools([], ["bash", "str_replace_editor"]), []);
});

test("restoreTools keeps a replacement set from another extension", () => {
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read"]), ["read"]);
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read", "bash"]), ["read", "bash"]);
});

test("restoreTools uses defaults only when the bootstrap snapshot is unavailable", () => {
	assert.deepEqual(restoreTools(undefined, ["bash", "str_replace_editor"]), ["read", "bash", "edit", "write"]);
});

test("stripOwnedTools only removes the editor", () => {
	assert.deepEqual(stripOwnedTools(["read", "bash", "str_replace_editor"]), ["read", "bash"]);
});

test("syncAdapter off->promoted preserves the existing selection on reload", () => {
	let active = ["bash", "str_replace_editor"];
	let lastSet: string[] | undefined;
	const pi = {
		getActiveTools: () => active,
		getAllTools: () => [],
		setActiveTools: (names: string[]) => {
			active = names;
			lastSet = names;
		},
		registerTool: () => undefined,
	};
	const ctx = {
		model: { provider: "opencode-go", id: "deepseek-v4-flash" },
		hasUI: false,
		ui: { setStatus: () => undefined },
	};
	const state: AdapterState = {
		enabled: true,
		cwd: "/tmp",
		config: { ...DEFAULT_DSH_MINIMAL_CONFIG },
		shell: undefined as never,
		bashOverrideInstalled: false,
		surface: "off",
		phase: {
			profile: "pro",
			promoted: true,
			compactionSeq: -1,
			userRounds: 1,
			hasAssistant: true,
			hasTool: false,
		},
		promptResources: emptyPromptResources(),
	};
	syncAdapter(pi as never, ctx as never, state);
	assert.deepEqual(lastSet, ["bash"]);
	assert.equal(state.surface, "promoted");
});

test("syncAdapter bootstrap->off restores the selected tools and active additions", () => {
	const registered = [
		{ name: "read", description: "r", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "bash", description: "b", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "edit", description: "e", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "write", description: "w", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "find", description: "f", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "grep", description: "g", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "ls", description: "l", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "ask_user_question", description: "a", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "web_search", description: "ws", parameters: {}, promptGuidelines: [], sourceInfo: {} },
	];
	let lastSet: string[] | undefined;
	let active: string[] = ["bash", "str_replace_editor", "web_search"];
	const pi = {
		getActiveTools: () => active,
		getAllTools: () => registered,
		setActiveTools: (names: string[]) => {
			active = names;
			lastSet = names;
		},
		registerTool: () => undefined,
	};
	const ctx = {
		model: { provider: "enterprise", id: "glm-5.3" },
		hasUI: false,
		ui: { setStatus: () => undefined },
	};
	const state: AdapterState = {
		enabled: true,
		cwd: "/tmp",
		previousToolNames: ["bash"],
		config: { ...DEFAULT_DSH_MINIMAL_CONFIG },
		shell: undefined as never,
		bashOverrideInstalled: false,
		surface: "bootstrap",
		phase: {
			profile: "pro",
			promoted: false,
			compactionSeq: -1,
			userRounds: 0,
			hasAssistant: false,
			hasTool: false,
		},
		promptResources: emptyPromptResources(),
	};
	syncAdapter(pi as never, ctx as never, state);
	assert.deepEqual(lastSet, ["bash", "web_search"]);
	assert.equal(state.surface, "off");
	assert.equal(state.enabled, false);
});

test("syncAdapter leaveBootstrap does not enable inactive registered tools", () => {
	const registered = [
		{ name: "read", description: "r", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "bash", description: "b", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "edit", description: "e", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "write", description: "w", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "find", description: "f", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "grep", description: "g", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "ls", description: "l", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "ask_user_question", description: "a", parameters: {}, promptGuidelines: [], sourceInfo: {} },
		{ name: "web_search", description: "ws", parameters: {}, promptGuidelines: [], sourceInfo: {} },
	];
	let lastSet: string[] | undefined;
	const pi = {
		getActiveTools: () => ["bash", "str_replace_editor", "web_search"],
		getAllTools: () => registered,
		setActiveTools: (names: string[]) => {
			lastSet = names;
		},
		registerTool: () => undefined,
	};
	const ctx = {
		model: { provider: "opencode-go", id: "deepseek-v4-flash" },
		hasUI: false,
		ui: { setStatus: () => undefined },
	};
	const state: AdapterState = {
		enabled: true,
		cwd: "/tmp",
		previousToolNames: ["bash"],
		config: { ...DEFAULT_DSH_MINIMAL_CONFIG },
		shell: undefined as never,
		bashOverrideInstalled: false,
		surface: "bootstrap",
		phase: {
			profile: "pro",
			promoted: true,
			compactionSeq: -1,
			userRounds: 1,
			hasAssistant: true,
			hasTool: false,
		},
		promptResources: emptyPromptResources(),
	};
	syncAdapter(pi as never, ctx as never, state);
	assert.deepEqual(lastSet, ["bash", "web_search"]);
});
