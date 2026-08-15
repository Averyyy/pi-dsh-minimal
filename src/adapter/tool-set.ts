export const STATUS_KEY = "dsh-minimal";
export const STATUS_TEXT = "\u001b[38;2;74;222;128mdsh minimal\u001b[0m";

export const DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"];
export const BASH_TOOL_NAME = "bash";
export const STR_REPLACE_EDITOR_TOOL_NAME = "str_replace_editor";
export const ADAPTER_TOOL_NAMES = [BASH_TOOL_NAME, STR_REPLACE_EDITOR_TOOL_NAME];

export function buildStatusText(options: { useOnAllModels: boolean }): string {
	return options.useOnAllModels ? `${STATUS_TEXT} • all models` : STATUS_TEXT;
}

export function mergeToolNames(...toolNameGroups: string[][]): string[] {
	return [...new Set(toolNameGroups.flat())];
}

export const ADAPTER_OWNED_TOOL_NAMES = [STR_REPLACE_EDITOR_TOOL_NAME];

export function stripOwnedTools(toolNames: string[], ownedTools: string[] = ADAPTER_OWNED_TOOL_NAMES): string[] {
	return toolNames.filter((toolName) => !ownedTools.includes(toolName));
}

export function restoreTools(
	previousTools: string[],
	activeTools: string[],
	ownedTools: string[] = ADAPTER_OWNED_TOOL_NAMES,
): string[] {
	const restored = stripOwnedTools(previousTools, ownedTools);
	for (const toolName of activeTools) {
		if (!ownedTools.includes(toolName) && !restored.includes(toolName)) {
			restored.push(toolName);
		}
	}
	return restored.length > 0 ? restored : [...DEFAULT_TOOL_NAMES];
}
