import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface DshMinimalConfig {
	enabled: boolean;
	statusLine: boolean;
	useOnAllModels: boolean;
	modelPatterns: string[];
}

export const DSH_MINIMAL_CONFIG_BASENAME = "pi-dsh-minimal.json";
export const DEFAULT_MODEL_PATTERNS = ["deepseek-v4-pro"];

export const DEFAULT_DSH_MINIMAL_CONFIG: DshMinimalConfig = {
	enabled: true,
	statusLine: true,
	useOnAllModels: false,
	modelPatterns: [...DEFAULT_MODEL_PATTERNS],
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeModelPatterns(value: unknown): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [...DEFAULT_MODEL_PATTERNS];
	}
	if (!Array.isArray(value)) return [...DEFAULT_MODEL_PATTERNS];
	const patterns = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return patterns.length > 0 ? [...new Set(patterns)] : [...DEFAULT_MODEL_PATTERNS];
}

export function getDshMinimalConfigPath(agentDir: string = getAgentDir()): string {
	return join(agentDir, DSH_MINIMAL_CONFIG_BASENAME);
}

export function readDshMinimalConfig(configPath: string = getDshMinimalConfigPath()): DshMinimalConfig {
	if (!existsSync(configPath)) {
		writeDshMinimalConfig(DEFAULT_DSH_MINIMAL_CONFIG, configPath);
		return { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns] };
	}

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
		if (!isObject(parsed)) {
			return { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns] };
		}
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_DSH_MINIMAL_CONFIG.enabled,
			statusLine: typeof parsed.statusLine === "boolean" ? parsed.statusLine : DEFAULT_DSH_MINIMAL_CONFIG.statusLine,
			useOnAllModels:
				typeof parsed.useOnAllModels === "boolean" ? parsed.useOnAllModels : DEFAULT_DSH_MINIMAL_CONFIG.useOnAllModels,
			modelPatterns: normalizeModelPatterns(parsed.modelPatterns),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-dsh-minimal] Failed to read ${configPath}: ${message}`);
		return { ...DEFAULT_DSH_MINIMAL_CONFIG, modelPatterns: [...DEFAULT_DSH_MINIMAL_CONFIG.modelPatterns] };
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
