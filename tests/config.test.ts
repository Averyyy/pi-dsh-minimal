import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_DSH_MINIMAL_CONFIG,
	normalizeFlashPatterns,
	normalizeFlashRouting,
	normalizeModelPatterns,
	readDshMinimalConfig,
	writeDshMinimalConfig,
} from "../src/adapter/config.ts";

test("normalizeModelPatterns drops empties and falls back to default", () => {
	assert.deepEqual(normalizeModelPatterns([" deepseek-v4-pro ", "", "foo"]), ["deepseek-v4-pro", "foo"]);
	assert.deepEqual(normalizeModelPatterns([]), [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns]);
});

test("normalizeFlashPatterns and routing have defaults", () => {
	assert.deepEqual(normalizeFlashPatterns([]), ["deepseek-v4-flash"]);
	assert.equal(normalizeFlashRouting("auto"), "auto");
	assert.equal(normalizeFlashRouting("nope"), "weak");
});

test("read/write round-trips config and fills new fields", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-"));
	const path = join(dir, "pi-dsh-minimal.json");
	const written = writeDshMinimalConfig(
		{
			enabled: false,
			statusLine: false,
			useOnAllModels: true,
			modelPatterns: ["gpt"],
			flashPatterns: ["flashy"],
			promoteOn: "tool-call",
			flashRouting: "auto",
		},
		path,
	);
	assert.equal(written.ok, true);
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: false,
		statusLine: false,
		useOnAllModels: true,
		modelPatterns: ["gpt"],
		flashPatterns: ["flashy"],
		promoteOn: "tool-call",
		flashRouting: "auto",
	});
	const raw = JSON.parse(readFileSync(path, "utf8")) as { enabled: boolean };
	assert.equal(raw.enabled, false);
});

test("read migrates old configs without flash fields", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-old-"));
	const path = join(dir, "pi-dsh-minimal.json");
	writeFileRaw(path, { enabled: true, statusLine: true, useOnAllModels: false, modelPatterns: ["deepseek-v4-pro"] });
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: true,
		statusLine: true,
		useOnAllModels: false,
		modelPatterns: ["deepseek-v4-pro"],
		flashPatterns: ["deepseek-v4-flash"],
		promoteOn: "either",
		flashRouting: "weak",
	});
});

function writeFileRaw(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value)}\n`);
}
