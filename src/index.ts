import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readDshMinimalConfig } from "./adapter/config.ts";
import { shouldUseAdapter, syncAdapter } from "./adapter/activation.ts";
import { rewriteMinimalProviderRequest, extractRequestSurface } from "./adapter/payload-rewrite.ts";
import { minimalSystemPrompt } from "./adapter/prompt.ts";
import type { AdapterState } from "./adapter/state.ts";
import { createPersistentBashSession } from "./tools/bash-session.ts";
import { registerStrReplaceEditorTool } from "./tools/str-replace-editor.ts";
import { registerDshCommand } from "./settings/command.ts";
import { restoreTools, stripOwnedTools } from "./adapter/tool-set.ts";

function dumpPath(): string | undefined {
	const value = process.env.PI_DSH_MINIMAL_DUMP;
	return value && value.length > 0 ? value : undefined;
}

export default function dshMinimal(pi: ExtensionAPI) {
	const state: AdapterState = {
		enabled: false,
		cwd: process.cwd(),
		config: readDshMinimalConfig(),
		shell: createPersistentBashSession(process.cwd()),
		bashOverrideInstalled: false,
	};

	registerStrReplaceEditorTool(pi);
	registerDshCommand(pi, state);

	pi.on("session_start", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.shell.setCwd(ctx.cwd);
		state.config = readDshMinimalConfig();
		syncAdapter(pi, ctx, state);
	});

	pi.on("model_select", async (_event, ctx) => {
		state.cwd = ctx.cwd;
		state.shell.setCwd(ctx.cwd);
		syncAdapter(pi, ctx, state);
	});

	pi.on("session_shutdown", async () => {
		await state.shell.reset("session shutdown");
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (!shouldUseAdapter(ctx, state.config)) return undefined;
		syncAdapter(pi, ctx, state);
		return { systemPrompt: minimalSystemPrompt() };
	});

	pi.on("before_provider_request", async (event, ctx) => {
		if (!shouldUseAdapter(ctx, state.config)) return undefined;
		syncAdapter(pi, ctx, state);
		const rewritten = rewriteMinimalProviderRequest(event.payload);
		const dump = dumpPath();
		if (dump) {
			try {
				writeFileSync(dump, `${JSON.stringify(extractRequestSurface(rewritten), null, 2)}\n`, "utf8");
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
	rewriteMinimalProviderRequest,
	extractRequestSurface,
	restoreTools,
	stripOwnedTools,
	readDshMinimalConfig,
};
