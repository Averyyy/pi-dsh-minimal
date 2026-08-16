import type { PersistentBashSession } from "../tools/bash-session.ts";
import type { DshMinimalConfig } from "./config.ts";
import type { AdapterProfile } from "./profile.ts";

export type ToolSurface = "off" | "bootstrap" | "promoted";

export interface SessionPhase {
	profile: AdapterProfile;
	promoted: boolean;
	compactionSeq: number;
	firstUserText?: string;
	userRounds: number;
	hasAssistant: boolean;
	hasTool: boolean;
}

export function emptySessionPhase(): SessionPhase {
	return {
		profile: "inactive",
		promoted: false,
		compactionSeq: -1,
		userRounds: 0,
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
