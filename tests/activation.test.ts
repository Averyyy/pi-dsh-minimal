import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DSH_MINIMAL_CONFIG } from "../src/adapter/config.ts";
import { shouldUseAdapter } from "../src/adapter/activation.ts";
import { restoreTools, stripOwnedTools } from "../src/adapter/tool-set.ts";

function ctx(id: string, name?: string) {
	return { model: { provider: "opencode-go", id, name } };
}

test("shouldUseAdapter defaults to DeepSeek V4 Pro only", () => {
	const config = { ...DEFAULT_DSH_MINIMAL_CONFIG };
	assert.equal(shouldUseAdapter(ctx("deepseek-v4-pro", "DeepSeek V4 Pro (New)"), config), true);
	assert.equal(shouldUseAdapter(ctx("deepseek-v4-flash"), config), false);
	assert.equal(shouldUseAdapter(ctx("gpt-5.6-luna"), config), false);
});

test("shouldUseAdapter honors useOnAllModels and enabled", () => {
	assert.equal(shouldUseAdapter(ctx("gpt-5.6-luna"), { ...DEFAULT_DSH_MINIMAL_CONFIG, useOnAllModels: true }), true);
	assert.equal(shouldUseAdapter(ctx("deepseek-v4-pro"), { ...DEFAULT_DSH_MINIMAL_CONFIG, enabled: false }), false);
});

test("shouldUseAdapter honors custom patterns", () => {
	assert.equal(
		shouldUseAdapter(ctx("my-ds-pro"), { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: ["my-ds-pro"] }),
		true,
	);
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
