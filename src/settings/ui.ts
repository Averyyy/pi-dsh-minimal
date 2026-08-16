import { getSettingsListTheme, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { SettingsList, truncateToWidth, type SettingItem } from "@earendil-works/pi-tui";
import {
	cloneConfig,
	DEFAULT_DSH_MINIMAL_CONFIG,
	DEFAULT_MODEL_PATTERNS,
	type DshMinimalConfig,
} from "../adapter/config.ts";
import { contextModel, describeModel, modelMatchesPatterns } from "../adapter/model.ts";
import { resolveAdapterProfile } from "../adapter/profile.ts";
import { normalizePromoteOn, type PromoteOn } from "../adapter/promotion.ts";
import { CHANGELOG_URL, GITHUB_URL, HF_MODEL_CARD_URL, ISSUE_URL, openExternalUrl } from "./links.ts";

export interface DshSettingsScreenOptions {
	initialConfig: DshMinimalConfig;
	onChange: (nextConfig: DshMinimalConfig) => boolean;
	initialTab?: SettingsTab;
	currentModel?: { provider?: string; id?: string; name?: string };
}

type SettingsTab = "general" | "models" | "about";

const TAB_ORDER: readonly SettingsTab[] = ["general", "models", "about"];
const PROMOTE_VALUES: PromoteOn[] = ["either", "tool-call", "assistant-message"];

export async function openDshSettingsScreen(ctx: ExtensionContext, options: DshSettingsScreenOptions): Promise<void> {
	let draft = cloneConfig(options.initialConfig);
	let activeTab: SettingsTab = options.initialTab ?? "general";
	const currentModel = options.currentModel ?? contextModel(ctx);

	await ctx.ui.custom<void>((tui, theme, _kb, done) => {
		let settingsList = createSettingsList(activeTab, draft, currentModel, options, (nextDraft) => {
			draft = nextDraft;
		}, done, () => tui.requestRender());

		const switchTab = () => {
			const currentIndex = TAB_ORDER.indexOf(activeTab);
			activeTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length] ?? "general";
			settingsList = createSettingsList(activeTab, draft, currentModel, options, (nextDraft) => {
				draft = nextDraft;
			}, done, () => tui.requestRender());
			tui.requestRender();
		};

		return {
			render: (width: number) =>
				[
					rule(width, theme, "accent"),
					formatTabs(activeTab, theme),
					rule(width, theme, "borderMuted"),
					...(activeTab === "models" ? formatModelNotes(theme, draft, currentModel) : []),
					...(activeTab === "about" ? formatLinks(theme) : []),
					"",
					...(activeTab === "about" ? [] : settingsList.render(width)),
					rule(width, theme, "accent"),
					theme.fg("dim", formatFooter(activeTab)),
				].map((line) => truncateToWidth(line, width, "")),
			invalidate: () => settingsList.invalidate(),
			handleInput: (data: string) => {
				if (data === "\t") {
					switchTab();
					return;
				}
				if (activeTab === "about" && handleLinkKey(data, ctx)) return;
				settingsList.handleInput?.(data);
				tui.requestRender();
			},
		};
	});
}

function rule(width: number, theme: Theme, color: "accent" | "borderMuted"): string {
	return theme.fg(color, "─".repeat(Math.max(0, width)));
}

function createSettingsList(
	tab: SettingsTab,
	draft: DshMinimalConfig,
	currentModel: ReturnType<typeof contextModel>,
	options: DshSettingsScreenOptions,
	onDraftChanged: (draft: DshMinimalConfig) => void,
	done: (value?: void) => void,
	requestRender: () => void,
): SettingsList {
	let settingsList: SettingsList;
	settingsList = new SettingsList(
		buildItems(tab, draft, currentModel),
		12,
		getSettingsListTheme(),
		(id, value) => {
			const nextDraft = applySettingChange(id, value, draft, currentModel);
			const previousValue = buildItems(tab, draft, currentModel).find((item) => item.id === id)?.currentValue;
			if (options.onChange(nextDraft)) {
				onDraftChanged(nextDraft);
				draft = nextDraft;
				if (tab === "models") {
					settingsList = createSettingsList(tab, draft, currentModel, options, onDraftChanged, done, requestRender);
				}
			} else if (previousValue !== undefined) {
				settingsList.updateValue(id, previousValue);
			}
			requestRender();
		},
		() => done(undefined),
	);
	return settingsList;
}

function buildItems(
	tab: SettingsTab,
	draft: DshMinimalConfig,
	currentModel: ReturnType<typeof contextModel>,
): SettingItem[] {
	if (tab === "about") return [];

	if (tab === "models") {
		const items: SettingItem[] = [];
		for (const [index, pattern] of draft.modelPatterns.entries()) {
			items.push({
				id: `pro:${index}`,
				label: `Pro  ${pattern}`,
				currentValue: "keep",
				values: ["keep", "remove"],
				description: "Cycle to remove this V4 Pro trigger pattern.",
			});
		}
		const currentId = currentModel?.id?.trim();
		if (currentId) {
			const inPro = draft.modelPatterns.includes(currentId);
			if (!inPro) {
				items.push({
					id: "addCurrent",
					label: "Add current model",
					currentValue: "no",
					values: ["no", "yes"],
					description: `Add ${describeModel(currentModel)} to the Pro trigger patterns.`,
				});
			}
		}
		if (items.length === 0) {
			items.push({
				id: "restoreDefault",
				label: "Restore default patterns",
				currentValue: "no",
				values: ["no", "yes"],
				description: "Restore deepseek-v4-pro and deepseek-v4-flash.",
			});
		}
		return items;
	}

	return [
		{ id: "enabled", label: "Enabled", currentValue: draft.enabled ? "on" : "off", values: ["off", "on"] },
		{
			id: "useOnAllModels",
			label: "Use on all models",
			currentValue: draft.useOnAllModels ? "on" : "off",
			values: ["off", "on"],
			description: "Unknown models use the Pro (anchored) profile.",
		},
		{
			id: "promoteOn",
			label: "Pro promote on",
			currentValue: draft.promoteOn,
			values: [...PROMOTE_VALUES],
			description: "After this signal, Pro restores Pi's original tools. Default: either.",
		},
		{ id: "statusLine", label: "Statusline", currentValue: draft.statusLine ? "on" : "off", values: ["off", "on"] },
	];
}

function applySettingChange(
	id: string,
	value: string,
	draft: DshMinimalConfig,
	currentModel: ReturnType<typeof contextModel>,
): DshMinimalConfig {
	const next = cloneConfig(draft);
	if (id === "enabled") next.enabled = value === "on";
	if (id === "useOnAllModels") next.useOnAllModels = value === "on";
	if (id === "statusLine") next.statusLine = value === "on";
	if (id === "promoteOn") next.promoteOn = normalizePromoteOn(value);
	if (id === "addCurrent" && value === "yes" && currentModel?.id) {
		next.modelPatterns = [...new Set([...next.modelPatterns, currentModel.id])];
	}
	if (id === "restoreDefault" && value === "yes") {
		next.modelPatterns = [...DEFAULT_MODEL_PATTERNS];
	}
	if (id.startsWith("pro:") && value === "remove") {
		const index = Number(id.slice("pro:".length));
		if (Number.isInteger(index) && index >= 0 && index < next.modelPatterns.length) {
			next.modelPatterns.splice(index, 1);
			if (next.modelPatterns.length === 0) next.modelPatterns = [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns];
		}
	}
	return next;
}

function formatTabs(activeTab: SettingsTab, theme: Theme): string {
	const renderTab = (tab: SettingsTab, label: string) => (activeTab === tab ? theme.bold(label) : theme.fg("dim", label));
	return `  ${renderTab("general", "General")}  ${theme.fg("dim", "/")}  ${renderTab("models", "Models")}  ${theme.fg("dim", "/")}  ${renderTab("about", "About")}`;
}

function formatFooter(activeTab: SettingsTab): string {
	if (activeTab === "about") return "  Tab to switch sections · g/c/h/i open links";
	if (activeTab === "models") return "  Tab · /dsh match <pattern>";
	return "  Tab to switch sections";
}

function formatModelNotes(
	theme: Theme,
	draft: DshMinimalConfig,
	currentModel: ReturnType<typeof contextModel>,
): string[] {
	const profile = resolveAdapterProfile({ model: currentModel }, draft);
	return [
		theme.fg("dim", `  Current model: ${describeModel(currentModel)}`),
		theme.fg("dim", `  Active profile: ${draft.enabled ? profile : "disabled"}`),
		theme.fg(
			"dim",
			`  Pro match: ${modelMatchesPatterns(currentModel, draft.modelPatterns) ? "yes" : "no"}`,
		),
	];
}

function formatLinks(theme: Theme): string[] {
	return [
		`${theme.bold("g")} github   ${theme.fg("dim", GITHUB_URL)}`,
		`${theme.bold("c")} changes  ${theme.fg("dim", CHANGELOG_URL)}`,
		`${theme.bold("h")} hf card  ${theme.fg("dim", HF_MODEL_CARD_URL)}`,
		`${theme.bold("i")} issue    ${theme.fg("dim", ISSUE_URL)}`,
	];
}

function handleLinkKey(data: string, ctx: ExtensionContext): boolean {
	const target = getLinkTarget(data);
	if (!target) return false;
	openExternalUrl(target.url);
	ctx.ui.notify(target.message, "info");
	return true;
}

function getLinkTarget(data: string): { url: string; message: string } | undefined {
	switch (data) {
		case "g":
			return { url: GITHUB_URL, message: "Opened GitHub" };
		case "c":
			return { url: CHANGELOG_URL, message: "Opened changelog" };
		case "h":
			return { url: HF_MODEL_CARD_URL, message: "Opened DeepSeek V4 Pro model card" };
		case "i":
			return { url: ISSUE_URL, message: "Opened issue form" };
		default:
			return undefined;
	}
}
