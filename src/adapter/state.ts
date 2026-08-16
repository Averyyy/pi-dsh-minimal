import type { PersistentBashSession } from "../tools/bash-session.ts";
import type { RouterMode } from "../routing/core.ts";
import type { DshMinimalConfig } from "./config.ts";
import type { AdapterProfile } from "./profile.ts";

export type ToolSurface = "off" | "bootstrap" | "promoted" | "flash";

export interface SessionPhase {
	profile: AdapterProfile;
	promoted: boolean;
	compactionSeq: number;
	firstUserText?: string;
	userRounds: number;
	chatStandDown: boolean;
	mode: RouterMode;
	hasAssistant: boolean;
	hasTool: boolean;
}

export function emptySessionPhase(): SessionPhase {
	return {
		profile: "inactive",
		promoted: false,
		compactionSeq: -1,
		userRounds: 0,
		chatStandDown: false,
		mode: "weak",
		hasAssistant: false,
		hasTool: false,
	};
}

export interface AdapterState {
	enabled: boolean;
	cwd: string;
	previousToolNames?: string[];
	config: DshMinimalConfig;
	shell: PersistentBashSession;
	bashOverrideInstalled: boolean;
	surface: ToolSurface;
	phase: SessionPhase;
}
