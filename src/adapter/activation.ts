import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { resolveAdapterProfile, shouldUseAdapter, type AdapterProfile } from "./profile.ts";
import type { AdapterState, ToolSurface } from "./state.ts";
import {
	ADAPTER_TOOL_NAMES,
	buildStatusText,
	DEFAULT_TOOL_NAMES,
	restoreTools,
	STATUS_KEY,
	stripOwnedTools,
} from "./tool-set.ts";
import { registerDshBashTool } from "../tools/bash.ts";

export { shouldUseAdapter, resolveAdapterProfile };

export function desiredSurface(profile: AdapterProfile, promoted: boolean): ToolSurface {
	if (profile === "inactive") return "off";
	if (profile === "flash") return "flash";
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
		setStatus(ctx, state);
		return;
	}

	if (surface === "bootstrap") {
		enterBootstrap(pi, state);
	} else if (state.surface === "bootstrap") {
		leaveBootstrap(pi, state);
	}

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
		restorePiBash(pi, state.cwd);
		state.bashOverrideInstalled = false;
	}
	const previousToolNames =
		state.previousToolNames && state.previousToolNames.length > 0 ? state.previousToolNames : DEFAULT_TOOL_NAMES;
	pi.setActiveTools(restoreTools(previousToolNames, pi.getActiveTools()));
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
			chatStandDown: state.phase.chatStandDown,
		}),
	);
}

export function rememberPreviousTools(pi: ExtensionAPI, state: AdapterState): void {
	if (!state.previousToolNames || state.previousToolNames.length === 0) {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
	}
}
