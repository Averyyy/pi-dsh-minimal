import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { modelMatchesPatterns, type ModelDescriptor } from "./model.ts";
import type { AdapterState } from "./state.ts";
import {
	ADAPTER_TOOL_NAMES,
	buildStatusText,
	DEFAULT_TOOL_NAMES,
	restoreTools,
	STATUS_KEY,
	stripOwnedTools,
} from "./tool-set.ts";
import { registerDshBashTool } from "../tools/bash.ts";

export function shouldUseAdapter(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: DshMinimalConfig,
): boolean {
	if (!config.enabled) return false;
	if (config.useOnAllModels) return true;
	const model = "model" in ctx ? ctx.model : undefined;
	return modelMatchesPatterns(model ?? undefined, config.modelPatterns);
}

export function syncAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (shouldUseAdapter(ctx, state.config)) {
		enableAdapter(pi, ctx, state);
	} else {
		disableAdapter(pi, ctx, state);
	}
}

function enableAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (!state.enabled) {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
		state.enabled = true;
	}
	if (!state.bashOverrideInstalled) {
		registerDshBashTool(pi, state);
		state.bashOverrideInstalled = true;
	}
	pi.setActiveTools([...ADAPTER_TOOL_NAMES]);
	setStatus(ctx, true, state.config);
}

function disableAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	if (state.bashOverrideInstalled) {
		restorePiBash(pi, state.cwd);
		state.bashOverrideInstalled = false;
	}
	const previousToolNames =
		state.previousToolNames && state.previousToolNames.length > 0 ? state.previousToolNames : DEFAULT_TOOL_NAMES;
	const restored = restoreTools(previousToolNames, pi.getActiveTools());
	if (state.enabled || pi.getActiveTools().includes("str_replace_editor")) {
		pi.setActiveTools(restored);
	}
	if (state.enabled) {
		state.enabled = false;
	}
	setStatus(ctx, false, state.config);
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

function setStatus(ctx: ExtensionContext, enabled: boolean, config: DshMinimalConfig): void {
	if (!ctx.hasUI) return;
	if (!config.statusLine) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	ctx.ui.setStatus(STATUS_KEY, enabled ? buildStatusText({ useOnAllModels: config.useOnAllModels }) : undefined);
}
