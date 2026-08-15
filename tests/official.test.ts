import test from "node:test";
import assert from "node:assert/strict";
import {
	DSH_MINIMAL_TOOL_NAMES,
	MINIMAL_BASH_DESCRIPTION,
	MINIMAL_PROMPT,
	STR_REPLACE_EDITOR_DESCRIPTION,
} from "../src/dsh/official.ts";

test("official minimal prompt is the complete persona only", () => {
	assert.equal(MINIMAL_PROMPT, "You are a helpful software engineer assistant.");
});

test("official tool catalog is exactly bash + str_replace_editor", () => {
	assert.deepEqual(DSH_MINIMAL_TOOL_NAMES, ["bash", "str_replace_editor"]);
});

test("official descriptions stay byte-identical to dsh", () => {
	assert.match(MINIMAL_BASH_DESCRIPTION, /does NOT need to be XML-escaped/);
	assert.match(MINIMAL_BASH_DESCRIPTION, /State is persistent/);
	assert.match(STR_REPLACE_EDITOR_DESCRIPTION, /cat -n/);
	assert.match(STR_REPLACE_EDITOR_DESCRIPTION, /old_str/);
});
