import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { normalizePromoteOn, type PromoteOn } from "./promotion.ts";

export interface DshMinimalConfig {
	enabled: boolean;
	statusLine: boolean;
	useOnAllModels: boolean;
	/** Pro (anchored-standard) trigger patterns. */
	modelPatterns: string[];
	promoteOn: PromoteOn;
}

export const DSH_MINIMAL_CONFIG_BASENAME = "pi-dsh-minimal.json";
// v0.3.1: flash joins pro by default — a controlled DeepSWE A/B measured
// 9/10 vs 6/10 solved when flash runs the anchored-standard bootstrap
// (runs/deepswe/RESULTS-flash-propath.md). The old weak-routing Flash
// profile stays removed.
export const DEFAULT_MODEL_PATTERNS = ["deepseek-v4-pro", "deepseek-v4-flash"];

export const DEFAULT_DSH_MINIMAL_CONFIG: DshMinimalConfig = {
	enabled: true,
	statusLine: true,
	useOnAllModels: false,
	modelPatterns: [...DEFAULT_MODEL_PATTERNS],
	promoteOn: "either",
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePatternList(value: unknown, fallback: string[]): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [...fallback];
	}
	if (!Array.isArray(value)) return [...fallback];
	const patterns = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return patterns.length > 0 ? [...new Set(patterns)] : [...fallback];
}

export function normalizeModelPatterns(value: unknown): string[] {
	return normalizePatternList(value, DEFAULT_MODEL_PATTERNS);
}

export function getDshMinimalConfigPath(agentDir: string = getAgentDir()): string {
	return join(agentDir, DSH_MINIMAL_CONFIG_BASENAME);
}

export function readDshMinimalConfig(configPath: string = getDshMinimalConfigPath()): DshMinimalConfig {
	if (!existsSync(configPath)) {
		writeDshMinimalConfig(DEFAULT_DSH_MINIMAL_CONFIG, configPath);
		return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
	}

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
		if (!isObject(parsed)) return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_DSH_MINIMAL_CONFIG.enabled,
			statusLine: typeof parsed.statusLine === "boolean" ? parsed.statusLine : DEFAULT_DSH_MINIMAL_CONFIG.statusLine,
			useOnAllModels:
				typeof parsed.useOnAllModels === "boolean" ? parsed.useOnAllModels : DEFAULT_DSH_MINIMAL_CONFIG.useOnAllModels,
			modelPatterns: normalizeModelPatterns(parsed.modelPatterns),
			promoteOn: normalizePromoteOn(parsed.promoteOn),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-dsh-minimal] Failed to read ${configPath}: ${message}`);
		return cloneConfig(DEFAULT_DSH_MINIMAL_CONFIG);
	}
}

export function writeDshMinimalConfig(
	config: DshMinimalConfig,
	configPath: string = getDshMinimalConfigPath(),
): { ok: true } | { ok: false; error: string } {
	try {
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-dsh-minimal] Failed to write ${configPath}: ${message}`);
		return { ok: false, error: message };
	}
}

export function cloneConfig(config: DshMinimalConfig): DshMinimalConfig {
	return {
		...config,
		modelPatterns: [...config.modelPatterns],
	};
}
