import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_DSH_MINIMAL_CONFIG,
	normalizeModelPatterns,
	readDshMinimalConfig,
	writeDshMinimalConfig,
} from "../src/adapter/config.ts";

test("normalizeModelPatterns drops empties and falls back to default", () => {
	assert.deepEqual(normalizeModelPatterns([" deepseek-v4-pro ", "", "foo"]), ["deepseek-v4-pro", "foo"]);
	assert.deepEqual(normalizeModelPatterns([]), [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns]);
});

test("read/write round-trips config", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-"));
	const path = join(dir, "pi-dsh-minimal.json");
	const written = writeDshMinimalConfig(
		{
			enabled: false,
			statusLine: false,
			useOnAllModels: true,
			modelPatterns: ["gpt"],
			promoteOn: "tool-call",
		},
		path,
	);
	assert.equal(written.ok, true);
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: false,
		statusLine: false,
		useOnAllModels: true,
		modelPatterns: ["gpt"],
		promoteOn: "tool-call",
	});
	const raw = JSON.parse(readFileSync(path, "utf8")) as { enabled: boolean };
	assert.equal(raw.enabled, false);
});

test("read ignores removed flash fields from older configs", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-config-old-"));
	const path = join(dir, "pi-dsh-minimal.json");
	writeFileRaw(path, {
		enabled: true,
		statusLine: true,
		useOnAllModels: false,
		modelPatterns: ["deepseek-v4-pro"],
		flashPatterns: ["deepseek-v4-flash"],
		flashRouting: "weak",
	});
	assert.deepEqual(readDshMinimalConfig(path), {
		enabled: true,
		statusLine: true,
		useOnAllModels: false,
		modelPatterns: ["deepseek-v4-pro"],
		promoteOn: "either",
	});
});

function writeFileRaw(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value)}\n`);
}
