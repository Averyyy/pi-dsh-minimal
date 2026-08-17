import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import { desiredSurface, resolveAdapterProfile, shouldUseAdapter } from "../src/adapter/activation.ts";
import { restoreTools, stripOwnedTools } from "../src/adapter/tool-set.ts";

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

test("restoreTools drops str_replace_editor and keeps previous Pi tools", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write", "web_search"], ["bash", "str_replace_editor", "custom"]),
		["read", "bash", "edit", "write", "web_search", "custom"],
	);
});

test("restoreTools keeps a replacement set from another extension", () => {
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read"]), ["read"]);
	assert.deepEqual(restoreTools(["read", "bash", "edit", "write"], ["read", "bash"]), ["read", "bash"]);
});

test("restoreTools on a pure bootstrap set restores the snapshot", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write"], ["bash", "str_replace_editor"]),
		["read", "bash", "edit", "write"],
	);
});

test("stripOwnedTools only removes the editor", () => {
	assert.deepEqual(stripOwnedTools(["read", "bash", "str_replace_editor"]), ["read", "bash"]);
});
