import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_FLASH_PATTERNS,
	DEFAULT_MODEL_PATTERNS,
	normalizeFlashRouting,
	readDshMinimalConfig,
	writeDshMinimalConfig,
	type DshMinimalConfig,
} from "../adapter/config.ts";
import { syncAdapter } from "../adapter/activation.ts";
import { normalizePromoteOn } from "../adapter/promotion.ts";
import type { AdapterState } from "../adapter/state.ts";
import { openDshSettingsScreen } from "./ui.ts";

const DSH_COMMAND_COMPLETIONS = [
	"on",
	"off",
	"all",
	"status",
	"models",
	"match",
	"unmatch",
	"flash-match",
	"flash-unmatch",
	"promote",
	"routing",
] as const;
const DSH_USAGE =
	"Usage: /dsh, /dsh on|off, /dsh all, /dsh status, /dsh models, /dsh match <pattern>, /dsh unmatch <pattern>, /dsh flash-match <pattern>, /dsh flash-unmatch <pattern>, /dsh promote either|tool-call|assistant-message, /dsh routing weak|auto|spec|react";

export function registerDshCommand(pi: ExtensionAPI, state: AdapterState): void {
	function saveAndApply(ctx: ExtensionContext, nextConfig: DshMinimalConfig): boolean {
		const writeResult = writeDshMinimalConfig(nextConfig);
		if (!writeResult.ok) {
			ctx.ui.notify(`Failed to save dsh settings: ${writeResult.error}`, "error");
			return false;
		}
		state.config = nextConfig;
		syncAdapter(pi, ctx, state);
		return true;
	}

	pi.registerCommand("dsh", {
		description: "Configure DeepSeek Harness adapter (Pro anchored-standard / Flash routing)",
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
			if (head === "match" || head === "flash-match") {
				if (!restText) {
					ctx.ui.notify(`Usage: /dsh ${head} <pattern>`, "warning");
					return;
				}
				if (head === "flash-match") {
					saveAndApply(ctx, {
						...state.config,
						flashPatterns: [...new Set([...state.config.flashPatterns, restText])],
					});
					return;
				}
				saveAndApply(ctx, {
					...state.config,
					modelPatterns: [...new Set([...state.config.modelPatterns, restText])],
				});
				return;
			}
			if (head === "unmatch" || head === "flash-unmatch") {
				if (!restText) {
					ctx.ui.notify(`Usage: /dsh ${head} <pattern>`, "warning");
					return;
				}
				if (head === "flash-unmatch") {
					const nextPatterns = state.config.flashPatterns.filter((pattern) => pattern !== restText);
					saveAndApply(ctx, {
						...state.config,
						flashPatterns: nextPatterns.length > 0 ? nextPatterns : [...DEFAULT_FLASH_PATTERNS],
					});
					return;
				}
				const nextPatterns = state.config.modelPatterns.filter((pattern) => pattern !== restText);
				saveAndApply(ctx, {
					...state.config,
					modelPatterns: nextPatterns.length > 0 ? nextPatterns : [...DEFAULT_MODEL_PATTERNS],
				});
				return;
			}
			if (head === "promote") {
				if (!restText) {
					ctx.ui.notify("Usage: /dsh promote either|tool-call|assistant-message", "warning");
					return;
				}
				saveAndApply(ctx, { ...state.config, promoteOn: normalizePromoteOn(restText) });
				return;
			}
			if (head === "routing") {
				if (!restText) {
					ctx.ui.notify("Usage: /dsh routing weak|auto|spec|react", "warning");
					return;
				}
				saveAndApply(ctx, { ...state.config, flashRouting: normalizeFlashRouting(restText) });
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
	return [
		`dsh: ${config.enabled ? "on" : "off"}`,
		`all models ${config.useOnAllModels ? "on" : "off"}`,
		`promote ${config.promoteOn}`,
		`flash routing ${config.flashRouting}`,
		`pro ${config.modelPatterns.join(", ")}`,
		`flash ${config.flashPatterns.join(", ")}`,
	].join(", ");
}
