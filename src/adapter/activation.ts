import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { resolveAdapterProfile, shouldUseAdapter, type AdapterProfile } from "./profile.ts";
import type { AdapterState, ToolSurface } from "./state.ts";
import {
	ADAPTER_TOOL_NAMES,
	BASH_TOOL_NAME,
	buildStatusText,
	restorePromotedTools,
	STATUS_KEY,
	stripOwnedTools,
} from "./tool-set.ts";
import { MINIMAL_BASH_DESCRIPTION } from "../dsh/official.ts";
import { registerDshBashTool } from "../tools/bash.ts";

export { shouldUseAdapter, resolveAdapterProfile };

export function desiredSurface(profile: AdapterProfile, promoted: boolean): ToolSurface {
	if (profile === "inactive") return "off";
	return promoted ? "promoted" : "bootstrap";
}

export function syncAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	const profile = resolveAdapterProfile(ctx, state.config);
	state.phase.profile = profile;
	const nextSurface = desiredSurface(profile, state.phase.promoted);
	applySurface(pi, ctx, state, nextSurface);
}

function applySurface(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState, surface: ToolSurface): void {
	if (surface === state.surface) {
		if (surface === "off") deactivateOwnedTools(pi);
		setStatus(ctx, state);
		return;
	}

	if (surface === "bootstrap") {
		enterBootstrap(pi, state);
	} else if (state.surface === "bootstrap") {
		leaveBootstrap(pi, state);
	}

	if (surface === "off") deactivateOwnedTools(pi);

	state.surface = surface;
	state.enabled = surface !== "off";
	setStatus(ctx, state);
}

function enterBootstrap(pi: ExtensionAPI, state: AdapterState): void {
	if (state.surface !== "bootstrap") {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
	}
	if (!state.bashOverrideInstalled) {
		registerDshBashTool(pi, state);
		state.bashOverrideInstalled = true;
	}
	pi.setActiveTools([...ADAPTER_TOOL_NAMES]);
}

function leaveBootstrap(pi: ExtensionAPI, state: AdapterState): void {
	if (state.bashOverrideInstalled) {
		if (bashStillOurs(pi)) restorePiBash(pi, state.cwd);
		state.bashOverrideInstalled = false;
	}
	// Restore the pre-bootstrap snapshot *plus* every tool currently registered.
	// Extensions may register tools after the snapshot was taken; without this
	// union those tools (web_search, fetch_content, subagent, …) would be
	// dropped forever once promotion happens.
	pi.setActiveTools(restorePromotedTools(state.previousToolNames ?? [], pi.getActiveTools(), pi.getAllTools()));
}

function deactivateOwnedTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const next = stripOwnedTools(active);
	if (next.length !== active.length) pi.setActiveTools(next);
}

function bashStillOurs(pi: ExtensionAPI): boolean {
	const bash = pi.getAllTools().find((tool) => tool.name === BASH_TOOL_NAME);
	return !bash || bash.description === MINIMAL_BASH_DESCRIPTION;
}

function restorePiBash(pi: ExtensionAPI, cwd: string): void {
	const builtin = createBashToolDefinition(cwd);
	pi.registerTool({
		name: builtin.name,
		label: builtin.label,
		description: builtin.description,
		parameters: builtin.parameters,
		promptSnippet: builtin.promptSnippet,
		promptGuidelines: builtin.promptGuidelines,
		constrainedSampling: builtin.constrainedSampling,
		renderShell: builtin.renderShell,
		prepareArguments: builtin.prepareArguments,
		executionMode: builtin.executionMode,
		execute: builtin.execute,
		renderCall: builtin.renderCall,
		renderResult: builtin.renderResult,
	});
}

function setStatus(ctx: ExtensionContext, state: AdapterState): void {
	if (!ctx.hasUI) return;
	if (!state.config.statusLine) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	ctx.ui.setStatus(
		STATUS_KEY,
		buildStatusText({
			profile: state.phase.profile,
			promoted: state.phase.promoted,
			useOnAllModels: state.config.useOnAllModels,
		}),
	);
}

export function rememberPreviousTools(pi: ExtensionAPI, state: AdapterState): void {
	if (!state.previousToolNames || state.previousToolNames.length === 0) {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
	}
}
