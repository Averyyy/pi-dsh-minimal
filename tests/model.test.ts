import test from "node:test";
import assert from "node:assert/strict";
import { isDeepSeekV4FlashModel, isDeepSeekV4ProModel, modelMatchesPatterns, normalizeModelToken } from "../src/adapter/model.ts";

test("normalizeModelToken collapses separators", () => {
	assert.equal(normalizeModelToken("DeepSeek V4 Pro"), "deepseekv4pro");
	assert.equal(normalizeModelToken("deepseek-v4-pro"), "deepseekv4pro");
	assert.equal(normalizeModelToken("deepseek/v4.pro"), "deepseekv4pro");
});

test("default DeepSeek V4 Pro matcher hits official ids and names", () => {
	assert.equal(isDeepSeekV4ProModel({ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (New)", provider: "opencode-go" }), true);
	assert.equal(isDeepSeekV4ProModel({ id: "deepseek-v4-pro-0813", provider: "deepseek" }), true);
	assert.equal(isDeepSeekV4ProModel({ name: "DeepSeek V4 Pro" }), true);
	assert.equal(isDeepSeekV4ProModel({ id: "deepseek-v4-flash" }), false);
	assert.equal(isDeepSeekV4ProModel({ id: "gpt-5.6-luna" }), false);
});

test("default DeepSeek V4 Flash matcher hits flash and misses pro", () => {
	assert.equal(isDeepSeekV4FlashModel({ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }), true);
	assert.equal(isDeepSeekV4FlashModel({ id: "deepseek-v4-pro" }), false);
});

test("custom patterns match substrings after normalization", () => {
	assert.equal(modelMatchesPatterns({ id: "acme-deepseek-v4-pro-exp" }, ["deepseek-v4-pro"]), true);
	assert.equal(modelMatchesPatterns({ id: "claude-opus" }, ["deepseek-v4-pro"]), false);
});
