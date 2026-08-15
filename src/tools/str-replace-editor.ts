import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import {
	DEFAULT_MAX_OUTPUT_CHARS,
	EDITOR_COMMAND_DESCRIPTION,
	EDITOR_COMMANDS,
	EDITOR_FILE_TEXT_DESCRIPTION,
	EDITOR_INSERT_LINE_DESCRIPTION,
	EDITOR_NEW_STR_DESCRIPTION,
	EDITOR_OLD_STR_DESCRIPTION,
	EDITOR_PATH_DESCRIPTION,
	EDITOR_VIEW_RANGE_DESCRIPTION,
	STR_REPLACE_EDITOR_DESCRIPTION,
	TRUNCATED_MESSAGE,
	type EditorCommand,
} from "../dsh/official.ts";

const STR_REPLACE_EDITOR_PARAMETERS = Type.Object({
	command: Type.Unsafe<EditorCommand>({
		type: "string",
		enum: [...EDITOR_COMMANDS],
		description: EDITOR_COMMAND_DESCRIPTION,
	}),
	path: Type.String({ description: EDITOR_PATH_DESCRIPTION }),
	file_text: Type.Optional(Type.String({ description: EDITOR_FILE_TEXT_DESCRIPTION })),
	insert_line: Type.Optional(Type.Integer({ description: EDITOR_INSERT_LINE_DESCRIPTION })),
	new_str: Type.Optional(Type.String({ description: EDITOR_NEW_STR_DESCRIPTION })),
	old_str: Type.Optional(Type.String({ description: EDITOR_OLD_STR_DESCRIPTION })),
	view_range: Type.Optional(Type.Array(Type.Integer(), { description: EDITOR_VIEW_RANGE_DESCRIPTION })),
});

interface EditorParams {
	command: EditorCommand;
	path: string;
	file_text?: string;
	insert_line?: number;
	new_str?: string;
	old_str?: string;
	view_range?: number[];
}

function maybeTruncate(content: string, maxOutputChars: number): string {
	return content.length <= maxOutputChars ? content : content.slice(0, maxOutputChars) + TRUNCATED_MESSAGE;
}

function isEditorCommand(value: unknown): value is EditorCommand {
	return typeof value === "string" && (EDITOR_COMMANDS as readonly string[]).includes(value);
}

function parseEditorParams(params: unknown): EditorParams {
	if (!params || typeof params !== "object") {
		throw new Error("str_replace_editor requires an object parameter");
	}
	const record = params as Record<string, unknown>;
	if (!isEditorCommand(record.command)) {
		throw new Error("str_replace_editor requires command to be one of view, create, str_replace, insert");
	}
	if (typeof record.path !== "string") {
		throw new Error("str_replace_editor requires a string 'path' parameter");
	}
	return {
		command: record.command,
		path: record.path,
		file_text: typeof record.file_text === "string" ? record.file_text : undefined,
		insert_line: typeof record.insert_line === "number" ? record.insert_line : undefined,
		new_str: typeof record.new_str === "string" ? record.new_str : undefined,
		old_str: typeof record.old_str === "string" ? record.old_str : undefined,
		view_range: Array.isArray(record.view_range)
			? record.view_range.filter((entry): entry is number => typeof entry === "number")
			: undefined,
	};
}

function requiredForCommand(value: string | undefined, parameter: string, command: string, allowEmpty = true): string {
	if (value === undefined) throw new Error(`Parameter \`${parameter}\` is required for command: ${command}`);
	if (!allowEmpty && value.length === 0) {
		throw new Error(`Parameter \`${parameter}\` is empty for command: ${command}`);
	}
	return value;
}

function assertAbsolutePath(path: string): void {
	if (path.trim().length === 0) throw new Error("path must be a non-empty string");
	if (!isAbsolute(path)) {
		throw new Error(`The path ${path} is not an absolute path, it should start with \`/\`. Maybe you meant /${path}?`);
	}
}

function matchOffsets(content: string, search: string): number[] {
	const offsets: number[] = [];
	let offset = 0;
	while (true) {
		const match = content.indexOf(search, offset);
		if (match < 0) return offsets;
		offsets.push(match);
		offset = match + search.length;
	}
}

function lineNumbersAt(content: string, offsets: readonly number[]): number[] {
	let line = 1;
	let cursor = 0;
	return offsets.map((offset) => {
		while (cursor < offset) {
			if (content[cursor] === "\n") line += 1;
			cursor += 1;
		}
		return line;
	});
}

function formatFileView(path: string, content: string, maxOutputChars: number, viewRange?: number[]): string {
	const allLines = content.split("\n");
	let lines = allLines;
	let initialLine = 1;
	let finalLine: number | undefined;
	let prompt = `Here's the content of ${path} with line numbers (which has a total of ${allLines.length} lines)`;
	if (viewRange !== undefined) {
		const [requestedInitialLine, requestedFinalLine] = viewRange;
		if (
			viewRange.length !== 2 ||
			requestedInitialLine === undefined ||
			requestedFinalLine === undefined ||
			!viewRange.every(Number.isInteger)
		) {
			throw new Error("Invalid `view_range`. It should be a list of two integers.");
		}
		initialLine = requestedInitialLine;
		finalLine = requestedFinalLine;
		if (initialLine < 1 || initialLine > allLines.length) {
			throw new Error(
				`Invalid \`view_range\`: [${viewRange.join(", ")}]. Its first element \`${initialLine}\` should be within the range of lines of the file: [1, ${allLines.length}]`,
			);
		}
		if (finalLine > allLines.length) {
			throw new Error(
				`Invalid \`view_range\`: [${viewRange.join(", ")}]. Its second element \`${finalLine}\` should be smaller than the number of lines in the file: \`${allLines.length}\``,
			);
		}
		if (finalLine !== -1 && finalLine < initialLine) {
			throw new Error(
				`Invalid \`view_range\`: [${viewRange.join(", ")}]. Its second element \`${finalLine}\` should be larger or equal than its first \`${initialLine}\``,
			);
		}
		lines = finalLine === -1 ? allLines.slice(initialLine - 1) : allLines.slice(initialLine - 1, finalLine);
		prompt += ` with view_range=[${initialLine}, ${finalLine}]`;
	}
	const numbered = lines.map((line, index) => `${String(initialLine + index).padStart(6, " ")}  ${line}`).join("\n");
	return maybeTruncate(`${prompt}:\n${numbered}\n`, maxOutputChars);
}

function codepointCompare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

async function listDirectory(path: string, maxOutputChars: number): Promise<string> {
	async function visit(dir: string, depth: number): Promise<string[]> {
		const entries = await readdir(dir, { withFileTypes: true });
		const rows: string[] = [];
		for (const entry of entries.filter(
			(candidate) =>
				!candidate.name.startsWith(".") && candidate.name !== "node_modules" && candidate.name !== "__pycache__",
		)) {
			const child = join(dir, entry.name);
			const type = entry.isDirectory() ? "d" : entry.isFile() ? "f" : "?";
			rows.push(`${type}\t${child}`);
			if (entry.isDirectory() && depth < 2) {
				rows.push(...(await visit(child, depth + 1)));
			}
		}
		return rows;
	}
	const rows = [`d\t${path}`, ...(await visit(path, 1))];
	rows.sort((left, right) => {
		const leftPath = left.slice(left.indexOf("\t") + 1);
		const rightPath = right.slice(right.indexOf("\t") + 1);
		return codepointCompare(leftPath, rightPath);
	});
	const listing = maybeTruncate(`${rows.join("\n")}\n`, maxOutputChars);
	return `Here're the files and directories up to 2 levels deep in ${path}, excluding hidden items, node_modules, and Python cache directories:\n${listing}\n`;
}

async function viewPath(path: string, viewRange: number[] | undefined, maxOutputChars: number): Promise<string> {
	let info;
	try {
		info = await stat(path);
	} catch {
		throw new Error(`The path ${path} does not exist. Please provide a valid path.`);
	}
	if (info.isDirectory()) {
		if (viewRange !== undefined) {
			throw new Error("The `view_range` parameter is not allowed when `path` points to a directory.");
		}
		return listDirectory(path, maxOutputChars);
	}
	if (!info.isFile()) {
		throw new Error(`cannot view "${path}": not a regular file or directory`);
	}
	const content = await readFile(path, "utf8");
	return formatFileView(path, content, maxOutputChars, viewRange);
}

async function createFile(path: string, fileText: string | undefined): Promise<string> {
	const content = requiredForCommand(fileText, "file_text", "create");
	try {
		await stat(path);
		throw new Error(`File already exists at: ${path}. Cannot overwrite files using command \`create\`.`);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("File already exists")) throw error;
	}
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf8");
	return `New file created successfully at: ${path}`;
}

async function replaceInFile(path: string, oldStr: string | undefined, newStr: string | undefined): Promise<string> {
	const oldValue = requiredForCommand(oldStr, "old_str", "str_replace", false);
	const newValue = newStr ?? "";
	let info;
	try {
		info = await stat(path);
	} catch {
		throw new Error(`The path ${path} does not exist. Please provide a valid path.`);
	}
	if (info.isDirectory()) {
		throw new Error(`The path ${path} is a directory and only the \`view\` command can be used on directories`);
	}
	if (!info.isFile()) {
		throw new Error(`cannot edit "${path}": not a regular file`);
	}
	const before = await readFile(path, "utf8");
	const offsets = matchOffsets(before, oldValue);
	const offset = offsets[0];
	if (offset === undefined) {
		throw new Error(`No replacement was performed, old_str \`${oldValue}\` did not appear verbatim in ${path}.`);
	}
	if (offsets.length > 1) {
		const lines = lineNumbersAt(before, offsets);
		throw new Error(
			`No replacement was performed. Multiple occurrences of old_str \`${oldValue}\` in lines [${lines.join(", ")}]. Please ensure it is unique`,
		);
	}
	await writeFile(path, before.slice(0, offset) + newValue + before.slice(offset + oldValue.length), "utf8");
	return `The file ${path} has been edited successfully.`;
}

async function insertInFile(path: string, insertLine: number | undefined, newStr: string | undefined): Promise<string> {
	if (insertLine === undefined) throw new Error("Parameter `insert_line` is required for command: insert");
	const value = requiredForCommand(newStr, "new_str", "insert");
	let info;
	try {
		info = await stat(path);
	} catch {
		throw new Error(`The path ${path} does not exist. Please provide a valid path.`);
	}
	if (info.isDirectory()) {
		throw new Error(`The path ${path} is a directory and only the \`view\` command can be used on directories`);
	}
	if (!info.isFile()) {
		throw new Error(`cannot insert into "${path}": not a regular file`);
	}
	const before = await readFile(path, "utf8");
	const lines = before.split("\n");
	if (!Number.isInteger(insertLine) || insertLine < 0 || insertLine > lines.length) {
		throw new Error(
			`Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${lines.length}]`,
		);
	}
	const after = [...lines.slice(0, insertLine), ...value.split("\n"), ...lines.slice(insertLine)].join("\n");
	await writeFile(path, after, "utf8");
	return `The file ${path} has been edited successfully.`;
}

export async function executeStrReplaceEditor(
	params: EditorParams,
	maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
): Promise<string> {
	assertAbsolutePath(params.path);
	switch (params.command) {
		case "view":
			return viewPath(params.path, params.view_range, maxOutputChars);
		case "create":
			return createFile(params.path, params.file_text);
		case "str_replace":
			return replaceInFile(params.path, params.old_str, params.new_str);
		case "insert":
			return insertInFile(params.path, params.insert_line, params.new_str);
	}
}

export function registerStrReplaceEditorTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "str_replace_editor",
		label: "str_replace_editor",
		description: STR_REPLACE_EDITOR_DESCRIPTION,
		parameters: STR_REPLACE_EDITOR_PARAMETERS,
		async execute(_toolCallId, params) {
			const typed = parseEditorParams(params);
			const text = await executeStrReplaceEditor(typed);
			return {
				content: [{ type: "text" as const, text }],
				details: { command: typed.command, path: typed.path },
			};
		},
		renderCall(args, theme) {
			const command = typeof args.command === "string" ? args.command : "edit";
			const path = typeof args.path === "string" ? args.path : "";
			return new Text(`${theme.fg("toolTitle", theme.bold(command))} ${theme.fg("accent", path)}`, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			if (!expanded) return new Text("", 0, 0);
			const textContent = result.content.find((item) => item.type === "text");
			const output = textContent && textContent.type === "text" ? textContent.text : "";
			if (!output) return new Text("", 0, 0);
			return new Text(`\n${theme.fg("toolOutput", output)}`, 0, 0);
		},
	});
}
