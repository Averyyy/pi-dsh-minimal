import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { BASH_COMMAND_DESCRIPTION, DEFAULT_BASH_TIMEOUT_MS, DEFAULT_MAX_OUTPUT_CHARS, MINIMAL_BASH_DESCRIPTION } from "../dsh/official.ts";
import type { AdapterState } from "../adapter/state.ts";

const BASH_PARAMETERS = Type.Object({
	command: Type.String({ description: BASH_COMMAND_DESCRIPTION }),
});

interface BashParams {
	command: string;
}

function parseBashParams(params: unknown): BashParams {
	if (!params || typeof params !== "object") {
		throw new Error("bash requires an object parameter");
	}
	const command = "command" in params ? params.command : undefined;
	if (typeof command !== "string") {
		throw new Error("bash requires a string 'command' parameter");
	}
	return { command };
}

export function registerDshBashTool(pi: ExtensionAPI, state: AdapterState): void {
	pi.registerTool({
		name: "bash",
		label: "bash",
		description: MINIMAL_BASH_DESCRIPTION,
		parameters: BASH_PARAMETERS,
		executionMode: "sequential",
		async execute(_toolCallId, params, signal) {
			const typed = parseBashParams(params);
			const text = await state.shell.exec(typed.command, {
				timeoutMs: DEFAULT_BASH_TIMEOUT_MS,
				maxOutputChars: DEFAULT_MAX_OUTPUT_CHARS,
				signal,
			});
			return {
				content: [{ type: "text" as const, text }],
				details: { command: typed.command },
			};
		},
		renderCall(args, theme) {
			const command = typeof args.command === "string" ? args.command : "...";
			return new Text(theme.fg("toolTitle", theme.bold(`$ ${command}`)), 0, 0);
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
