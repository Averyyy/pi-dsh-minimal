import { writeFileSync } from "node:fs";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readDshMinimalConfig } from "./adapter/config.ts";
import { enforceBootstrapTools, resolveAdapterProfile, shouldUseAdapter, syncAdapter } from "./adapter/activation.ts";
import { extractRequestSurface, rewriteProviderRequest } from "./adapter/payload-rewrite.ts";
import { composeAnchoredPrompt, promptResourcesFrom, toolResourcesFromLiveTools } from "./adapter/prompt.ts";
import { isPromoted, scanSessionPhase } from "./adapter/promotion.ts";
import { emptyPromptResources, emptySessionPhase, type AdapterState } from "./adapter/state.ts";
import { restoreTools, stripOwnedTools } from "./adapter/tool-set.ts";
import { registerDshCommand } from "./settings/command.ts";
import { createPersistentBashSession } from "./tools/bash-session.ts";
import { registerStrReplaceEditorTool } from "./tools/str-replace-editor.ts";

function dumpPath(): string | undefined {
	const value = process.env.PI_DSH_MINIMAL_DUMP;
	return value && value.length > 0 ? value : undefined;
}

function sessionEntries(ctx: ExtensionContext) {
	try {
		return ctx.sessionManager.buildContextEntries();
	} catch {
		try {
			return ctx.sessionManager.getEntries();
		} catch {
			return [];
		}
	}
}

function refreshPhase(pi: ExtensionAPI, ctx: ExtensionContext, state: AdapterState): void {
	const scan = scanSessionPhase(sessionEntries(ctx), state.config.promoteOn);
	if (scan.firstUserText && !state.phase.firstUserText) state.phase.firstUserText = scan.firstUserText;
	state.phase.userRounds = Math.max(state.phase.userRounds, scan.userRounds);
	state.phase.hasAssistant = state.phase.hasAssistant || scan.hasAssistant;
	state.phase.hasTool = state.phase.hasTool || scan.hasTool;
	state.phase.compactionSeq = scan.compactionSeq;

	const profile = resolveAdapterProfile(ctx, state.config);
	state.phase.profile = profile;
	state.phase.promoted = profile === "pro" && isPromoted(state.phase, state.config.promoteOn);
	syncAdapter(pi, ctx, state);
}

function composeCurrentPrompt(
	pi: ExtensionAPI,
	state: AdapterState,
	assembledPrompt?: string,
): string {
	// On promote, refresh tools-guide inputs from the live catalog: the
	// bootstrap-time snapshot may hold sparse/empty toolSnippets, which made
	// the re-anchored guide render "(none)" for the rest of the first task.
	const liveResources = state.phase.promoted ? toolResourcesFromLiveTools(pi.getAllTools()) : {};
	return composeAnchoredPrompt({
		...state.promptResources,
		...liveResources,
		selectedTools: state.phase.promoted ? pi.getActiveTools() : state.promptResources.selectedTools,
		includeWorkspace: state.phase.promoted,
		assembledPrompt,
	});
}

function noteUserText(state: AdapterState, text: string | undefined): void {
	const trimmed = text?.trim();
	if (!trimmed) return;
	if (!state.phase.firstUserText) state.phase.firstUserText = trimmed;
	if (state.phase.userRounds === 0) state.phase.userRounds = 1;
}

function noteAssistant(state: AdapterState, message: AgentMessage | undefined): void {
	if (!message || message.role !== "assistant") return;
	state.phase.hasAssistant = true;
	if (Array.isArray(message.content) && message.content.some((part) => part?.type === "toolCall")) {
		state.phase.hasTool = true;
	}
}

export default function dshMinimal(pi: ExtensionAPI) {
	const state: AdapterState = {
		enabled: false,
		cwd: process.cwd(),
		config: readDshMinimalConfig(),
		shell: createPersistentBashSession(process.cwd()),
		bashOverrideInstalled: false,
		surface: "off",
		phase: emptySessionPhase(),
		promptResources: emptyPromptResources(),
	};

	registerStrReplaceEditorTool(pi);
	registerDshCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.shell.setCwd(ctx.cwd);
		state.config = readDshMinimalConfig();
		state.phase = emptySessionPhase();
		state.promptResources = emptyPromptResources();
		refreshPhase(pi, ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.shell.setCwd(ctx.cwd);
		refreshPhase(pi, ctx, state);
	});

	pi.on("session_compact", async (_event, ctx) => {
		state.phase.hasAssistant = false;
		state.phase.hasTool = false;
		state.phase.promoted = false;
		refreshPhase(pi, ctx, state);
	});

	pi.on("session_shutdown", async () => {
		await state.shell.reset("session shutdown");
	});

	pi.on("input", async (event) => {
		noteUserText(state, event.text);
		return undefined;
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		noteUserText(state, _event.prompt);
		refreshPhase(pi, ctx, state);
		if (state.phase.profile === "inactive") return undefined;
		state.promptResources = promptResourcesFrom(_event.systemPromptOptions);
		// Bootstrap wipes only on the wire (before_provider_request). Do not
		// replace the chained system prompt here, or later extensions' appends
		// are gone before promote can reanchor them.
		if (!state.phase.promoted) return undefined;
		return { systemPrompt: composeCurrentPrompt(pi, state, _event.systemPrompt) };
	});

	pi.on("message_end", async (event, ctx) => {
		noteAssistant(state, event.message);
		if (state.phase.hasAssistant || state.phase.hasTool) refreshPhase(pi, ctx, state);
	});

	pi.on("tool_call", async (_event, ctx) => {
		state.phase.hasTool = true;
		refreshPhase(pi, ctx, state);
	});

	pi.on("before_provider_request", async (event, ctx) => {
		refreshPhase(pi, ctx, state);
		if (state.phase.profile === "inactive") return undefined;

		// Other extensions may have appended tools to the active set during
		// before_agent_start; the first-turn surface must stay exactly the
		// official two tools even at the active-set level.
		enforceBootstrapTools(pi, state);

		const assembled = extractRequestSurface(event.payload).system ?? ctx.getSystemPrompt();
		const rewritten = rewriteProviderRequest(event.payload, {
			persona: composeCurrentPrompt(pi, state, assembled),
			rewriteTools: state.phase.profile === "pro" && !state.phase.promoted,
		});
		const dump = dumpPath();
		if (dump) {
			try {
				const surface = extractRequestSurface(rewritten);
				writeFileSync(
					dump,
					`${JSON.stringify({
						profile: state.phase.profile,
						promoted: state.phase.promoted,
						surface: state.surface,
						...surface,
					})}\n`,
					{ encoding: "utf8", flag: "a" },
				);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.warn(`[pi-dsh-minimal] Failed to dump request surface: ${message}`);
			}
		}
		return rewritten;
	});
}

export {
	shouldUseAdapter,
	syncAdapter,
	resolveAdapterProfile,
	rewriteProviderRequest,
	extractRequestSurface,
	restoreTools,
	stripOwnedTools,
	readDshMinimalConfig,
	scanSessionPhase,
	isPromoted,
};
