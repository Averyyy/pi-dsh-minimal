import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeStrReplaceEditor } from "../src/tools/str-replace-editor.ts";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "pi-dsh-minimal-editor-"));
}

test("view prints cat -n style numbered output", async () => {
	const dir = tempDir();
	const path = join(dir, "preset-smoke.txt");
	writeFileSync(path, "MINIMAL_EDITOR_OK\n");
	const text = await executeStrReplaceEditor({ command: "view", path });
	assert.match(text, /Here's the content of /);
	assert.match(text, /total of 2 lines/);
	assert.match(text, /     1  MINIMAL_EDITOR_OK/);
});

test("create, str_replace, and insert match official result strings", async () => {
	const dir = tempDir();
	const path = join(dir, "file.txt");
	assert.equal(await executeStrReplaceEditor({ command: "create", path, file_text: "alpha\n" }), `New file created successfully at: ${path}`);
	assert.equal(
		await executeStrReplaceEditor({ command: "str_replace", path, old_str: "alpha", new_str: "beta" }),
		`The file ${path} has been edited successfully.`,
	);
	assert.equal(readFileSync(path, "utf8"), "beta\n");
	assert.equal(
		await executeStrReplaceEditor({ command: "insert", path, insert_line: 1, new_str: "gamma" }),
		`The file ${path} has been edited successfully.`,
	);
	assert.equal(readFileSync(path, "utf8"), "beta\ngamma\n");
});

test("create refuses to overwrite and relative paths are rejected", async () => {
	const dir = tempDir();
	const path = join(dir, "exists.txt");
	writeFileSync(path, "x");
	await assert.rejects(
		() => executeStrReplaceEditor({ command: "create", path, file_text: "y" }),
		/File already exists/,
	);
	await assert.rejects(
		() => executeStrReplaceEditor({ command: "view", path: "relative.txt" }),
		/not an absolute path/,
	);
});

test("str_replace requires a unique exact match", async () => {
	const dir = tempDir();
	const path = join(dir, "dup.txt");
	writeFileSync(path, "aa\naa\n");
	await assert.rejects(
		() => executeStrReplaceEditor({ command: "str_replace", path, old_str: "aa", new_str: "bb" }),
		/Multiple occurrences/,
	);
});

test("directory view lists two levels and skips hidden/node_modules", async () => {
	const dir = tempDir();
	mkdirSync(join(dir, "src"));
	writeFileSync(join(dir, "src", "a.ts"), "");
	mkdirSync(join(dir, "node_modules"));
	writeFileSync(join(dir, "node_modules", "pkg.js"), "");
	writeFileSync(join(dir, ".secret"), "");
	const text = await executeStrReplaceEditor({ command: "view", path: dir });
	assert.match(text, /files and directories up to 2 levels deep/);
	assert.match(text, /src/);
	assert.equal(text.includes(`\t${join(dir, "node_modules")}`), false);
	assert.equal(text.includes(`\t${join(dir, ".secret")}`), false);
});
