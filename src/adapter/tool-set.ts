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

/**
 * Tools to expose after leaving bootstrap.
 *
 * - Still on the two-tool set (plus optional newly registered names): restore
 *   the pre-bootstrap snapshot and keep those extras.
 * - Another extension replaced the set (plan mode, preset): keep that set.
 */
export function restoreTools(
	previousTools: string[],
	activeTools: string[],
	ownedTools: string[] = ADAPTER_OWNED_TOOL_NAMES,
): string[] {
	const previous = stripOwnedTools(previousTools, ownedTools);
	const current = stripOwnedTools(activeTools, ownedTools);
	const fallback = previous.length > 0 ? previous : [...DEFAULT_TOOL_NAMES];

	const stillBootstrap =
		current.length === 0 || current.every((name) => name === BASH_TOOL_NAME);
	if (stillBootstrap) return fallback;

	const extras = current.filter((name) => name !== BASH_TOOL_NAME && !previous.includes(name));
	const hasOriginalNonBash = current.some((name) => name !== BASH_TOOL_NAME && previous.includes(name));
	const bootstrapPlusAdds =
		!hasOriginalNonBash &&
		current.includes(BASH_TOOL_NAME) &&
		extras.length > 0 &&
		current.every((name) => name === BASH_TOOL_NAME || extras.includes(name));
	if (bootstrapPlusAdds) return mergeToolNames(previous.length > 0 ? previous : DEFAULT_TOOL_NAMES, extras);

	return current;
}

/**
 * Tool names to expose after leaving bootstrap.
 *
 * Unlike the pre-bootstrap snapshot alone, this unions the snapshot with the
 * live registered-tool catalog (`pi.getAllTools()`). Extension tools that were
 * registered after the snapshot was taken (web search, MCP, subagents, …)
 * therefore survive promotion instead of disappearing for the rest of the
 * session.
 */
export function restorePromotedTools(
	previousTools: string[],
	activeTools: string[],
	registeredTools: readonly { name: string }[],
	ownedTools: string[] = ADAPTER_OWNED_TOOL_NAMES,
): string[] {
	const snapshot = previousTools.length > 0 ? previousTools : [...DEFAULT_TOOL_NAMES];
	const allRegistered = registeredTools.map((tool) => tool.name);
	return restoreTools(mergeToolNames(snapshot, allRegistered), activeTools, ownedTools);
}
