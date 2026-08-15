/** Official DeepSeek Harness `minimal` persona. `complete: true` — no other prompt sections. */
export const MINIMAL_PROMPT = "You are a helpful software engineer assistant.";

/**
 * Official minimal-preset bash description from
 * `apps/cli/config/agent-presets/minimal/agent.cordis.yml`.
 */
export const MINIMAL_BASH_DESCRIPTION = `Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You don't have access to the internet via this tool.
* You do have access to a mirror of common linux and python packages via apt and pip.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.`;

/**
 * Official `str_replace_editor` default description from
 * `packages/fs/tool-str-replace-editor/src/index.ts`.
 */
export const STR_REPLACE_EDITOR_DESCRIPTION = `
Custom editing tool for viewing, creating and editing files
* State is persistent across command calls and discussions with the user
* If \`path\` is a file, \`view\` displays the result of applying \`cat -n\`. If \`path\` is a directory, \`view\` lists non-hidden files and directories up to 2 levels deep
* The \`create\` command cannot be used if the specified \`path\` already exists as a file
* If a \`command\` generates a long output, it will be truncated and marked with \`<response clipped>\`

Notes for using the \`str_replace\` command:
* The \`old_str\` parameter should match EXACTLY one or more consecutive lines from the original file. Be mindful of whitespaces!
* If the \`old_str\` parameter is not unique in the file, the replacement will not be performed. Make sure to include enough context in \`old_str\` to make it unique
* The \`new_str\` parameter should contain the edited lines that should replace the \`old_str\`
`.trim();

export const BASH_COMMAND_DESCRIPTION = "The bash command to run. Relative path is preferred in the command.";

export const EDITOR_COMMAND_DESCRIPTION =
	"The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.";

export const EDITOR_PATH_DESCRIPTION = "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`.";

export const EDITOR_FILE_TEXT_DESCRIPTION =
	"Required parameter of `create` command, with the content of the file to be created.";

export const EDITOR_INSERT_LINE_DESCRIPTION =
	"Required parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`.";

export const EDITOR_NEW_STR_DESCRIPTION =
	"Optional parameter of `str_replace` command containing the new string (if not given, no string will be added). Required parameter of `insert` command containing the string to insert.";

export const EDITOR_OLD_STR_DESCRIPTION =
	"Required parameter of `str_replace` command containing the string in `path` to replace.";

export const EDITOR_VIEW_RANGE_DESCRIPTION =
	"Optional parameter of `view` command when `path` points to a file. If none is given, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file.";

export const EDITOR_COMMANDS = ["view", "create", "str_replace", "insert"] as const;
export type EditorCommand = (typeof EDITOR_COMMANDS)[number];

/** Compiled dsh implicit-parameter JSON Schema for persistent `bash`. */
export const DSH_BASH_PARAMETERS = {
	type: "object",
	properties: {
		command: {
			type: "string",
			description: BASH_COMMAND_DESCRIPTION,
		},
	},
	required: ["command"],
} as const;

/** Compiled dsh implicit-parameter JSON Schema for `str_replace_editor`. */
export const DSH_STR_REPLACE_EDITOR_PARAMETERS = {
	type: "object",
	properties: {
		command: {
			type: "string",
			enum: ["view", "create", "str_replace", "insert"],
			description: EDITOR_COMMAND_DESCRIPTION,
		},
		path: {
			type: "string",
			description: EDITOR_PATH_DESCRIPTION,
		},
		file_text: {
			type: "string",
			description: EDITOR_FILE_TEXT_DESCRIPTION,
		},
		insert_line: {
			type: "integer",
			description: EDITOR_INSERT_LINE_DESCRIPTION,
		},
		new_str: {
			type: "string",
			description: EDITOR_NEW_STR_DESCRIPTION,
		},
		old_str: {
			type: "string",
			description: EDITOR_OLD_STR_DESCRIPTION,
		},
		view_range: {
			type: "array",
			items: { type: "integer" },
			description: EDITOR_VIEW_RANGE_DESCRIPTION,
		},
	},
	required: ["command", "path"],
} as const;

export interface DshToolSchema {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export const DSH_MINIMAL_TOOLS: readonly DshToolSchema[] = [
	{
		name: "bash",
		description: MINIMAL_BASH_DESCRIPTION,
		parameters: structuredClone(DSH_BASH_PARAMETERS) as unknown as Record<string, unknown>,
	},
	{
		name: "str_replace_editor",
		description: STR_REPLACE_EDITOR_DESCRIPTION,
		parameters: structuredClone(DSH_STR_REPLACE_EDITOR_PARAMETERS) as unknown as Record<string, unknown>,
	},
];

export const DSH_MINIMAL_TOOL_NAMES = DSH_MINIMAL_TOOLS.map((tool) => tool.name);

export const TRUNCATED_MESSAGE =
	"<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>";

export const SHELL_RESET_MESSAGE =
	"The persistent bash shell was reset; the next bash call starts from the workspace with a fresh current directory and environment.";

export const DEFAULT_BASH_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 16_000;
