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

test("resolveAdapterProfile splits Pro vs Flash", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-pro"), config), "pro");
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-flash"), config), "flash");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), config), "inactive");
	assert.equal(resolveAdapterProfile(ctx("gpt-5.6-luna"), { ...config, useOnAllModels: true }), "pro");
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-flash"), { ...config, useOnAllModels: true }), "flash");
	assert.equal(resolveAdapterProfile(ctx("deepseek-v4-pro"), { ...config, enabled: false }), "inactive");
});

test("shouldUseAdapter honors custom Pro patterns", () => {
	assert.equal(
		shouldUseAdapter(ctx("my-ds-pro"), { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: ["my-ds-pro"] }),
		true,
	);
});

test("desiredSurface is bootstrap then promoted for Pro, always flash for Flash", () => {
	assert.equal(desiredSurface("pro", false), "bootstrap");
	assert.equal(desiredSurface("pro", true), "promoted");
	assert.equal(desiredSurface("flash", false), "flash");
	assert.equal(desiredSurface("flash", true), "flash");
	assert.equal(desiredSurface("inactive", false), "off");
});

test("restoreTools drops str_replace_editor and keeps previous Pi tools", () => {
	assert.deepEqual(
		restoreTools(["read", "bash", "edit", "write", "web_search"], ["bash", "str_replace_editor", "custom"]),
		["read", "bash", "edit", "write", "web_search", "custom"],
	);
});

test("stripOwnedTools only removes the editor", () => {
	assert.deepEqual(stripOwnedTools(["read", "bash", "str_replace_editor"]), ["read", "bash"]);
});
