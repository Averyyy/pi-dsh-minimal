import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistentBashSession } from "../src/tools/bash-session.ts";

test("persistent bash keeps cwd and exported env across calls", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-bash-"));
	const shell = new PersistentBashSession(dir);
	try {
		await shell.exec(`cd ${JSON.stringify(dir)} && export DSH_MINIMAL_STATE=PERSISTED`);
		const output = await shell.exec(`printf '%s:%s\\n' "$DSH_MINIMAL_STATE" "$PWD"`);
		assert.equal(output.trim(), `PERSISTED:${dir}`);
	} finally {
		await shell.reset("test done");
	}
});

test("non-zero exit is annotated", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-bash-"));
	const shell = new PersistentBashSession(dir);
	try {
		const output = await shell.exec("false");
		assert.match(output, /\[exit code: 1\]/);
	} finally {
		await shell.reset("test done");
	}
});

test("empty command is rejected", async () => {
	const shell = new PersistentBashSession(process.cwd());
	await assert.rejects(() => shell.exec("   "), /non-empty/);
});
