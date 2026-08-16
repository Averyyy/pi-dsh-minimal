import type { AdapterProfile } from "./profile.ts";

export const STATUS_KEY = "dsh-minimal";
export const STATUS_ANCHORED = "\u001b[38;2;74;222;128mdsh anchored\u001b[0m";
export const STATUS_TEXT = STATUS_ANCHORED;

export const DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"];
export const BASH_TOOL_NAME = "bash";
export const STR_REPLACE_EDITOR_TOOL_NAME = "str_replace_editor";
export const ADAPTER_TOOL_NAMES = [BASH_TOOL_NAME, STR_REPLACE_EDITOR_TOOL_NAME];

export function buildStatusText(options: {
	profile: AdapterProfile;
	promoted?: boolean;
	useOnAllModels: boolean;
}): string | undefined {
	if (options.profile === "inactive") return undefined;
	const bits = [STATUS_ANCHORED];
	if (options.profile === "pro" && options.promoted) bits.push("promoted");
	if (options.useOnAllModels) bits.push("all models");
	return bits.length === 1 ? STATUS_ANCHORED : `${STATUS_ANCHORED} • ${bits.slice(1).join(" • ")}`;
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
