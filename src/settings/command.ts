import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readDshMinimalConfig, writeDshMinimalConfig, type DshMinimalConfig } from "../adapter/config.ts";
import { syncAdapter } from "../adapter/activation.ts";
import type { AdapterState } from "../adapter/state.ts";
import { openDshSettingsScreen } from "./ui.ts";

const DSH_COMMAND_COMPLETIONS = ["on", "off", "all", "status", "models", "match", "unmatch"] as const;
const DSH_USAGE =
	"Usage: /dsh, /dsh on|off, /dsh all, /dsh status, /dsh models, /dsh match <pattern>, /dsh unmatch <pattern>";

export function registerDshCommand(pi: ExtensionAPI, state: AdapterState): void {
	function saveAndApply(ctx: ExtensionContext, nextConfig: DshMinimalConfig): boolean {
		const writeResult = writeDshMinimalConfig(nextConfig);
		if (!writeResult.ok) {
			ctx.ui.notify(`Failed to save dsh minimal settings: ${writeResult.error}`, "error");
			return false;
		}
		state.config = nextConfig;
		syncAdapter(pi, ctx, state);
		return true;
	}

	pi.registerCommand("dsh", {
		description: "Configure DeepSeek Harness minimal-mode adapter",
		getArgumentCompletions: (prefix) => {
			const trimmed = prefix.trim().toLowerCase();
			const [head] = trimmed.split(/\s+/, 1);
			return DSH_COMMAND_COMPLETIONS.filter((item) => item.startsWith(head ?? "")).map((value) => ({
				label: value,
				value,
			}));
		},
		handler: async (args, ctx) => {
			state.config = readDshMinimalConfig();
			const trimmed = args.trim();
			const [rawHead, ...rest] = trimmed.split(/\s+/);
			const head = (rawHead ?? "").toLowerCase();
			const restText = rest.join(" ").trim();

			if (head === "on" || head === "off") {
				saveAndApply(ctx, { ...state.config, enabled: head === "on" });
				return;
			}
			if (head === "all") {
				saveAndApply(ctx, { ...state.config, useOnAllModels: !state.config.useOnAllModels });
				return;
			}
			if (head === "status") {
				saveAndApply(ctx, { ...state.config, statusLine: !state.config.statusLine });
				return;
			}
			if (head === "match") {
				if (!restText) {
					ctx.ui.notify("Usage: /dsh match <pattern>", "warning");
					return;
				}
				saveAndApply(ctx, {
					...state.config,
					modelPatterns: [...new Set([...state.config.modelPatterns, restText])],
				});
				return;
			}
			if (head === "unmatch") {
				if (!restText) {
					ctx.ui.notify("Usage: /dsh unmatch <pattern>", "warning");
					return;
				}
				const nextPatterns = state.config.modelPatterns.filter((pattern) => pattern !== restText);
				saveAndApply(ctx, {
					...state.config,
					modelPatterns: nextPatterns.length > 0 ? nextPatterns : ["deepseek-v4-pro"],
				});
				return;
			}
			if (head === "models") {
				if (!ctx.hasUI) {
					ctx.ui.notify(formatDshSettings(state.config), "info");
					return;
				}
				await openDshSettingsScreen(ctx, {
					initialConfig: state.config,
					initialTab: "models",
					onChange: (config) => saveAndApply(ctx, config),
				});
				return;
			}
			if (head) {
				ctx.ui.notify(DSH_USAGE, "warning");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify(formatDshSettings(state.config), "info");
				return;
			}
			await openDshSettingsScreen(ctx, {
				initialConfig: state.config,
				onChange: (config) => saveAndApply(ctx, config),
			});
		},
	});
}

export function formatDshSettings(config: DshMinimalConfig): string {
	return `dsh minimal: ${config.enabled ? "on" : "off"}, all models ${config.useOnAllModels ? "on" : "off"}, statusline ${config.statusLine ? "on" : "off"}, match ${config.modelPatterns.join(", ")}`;
}
