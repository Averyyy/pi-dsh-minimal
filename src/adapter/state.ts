import type { PersistentBashSession } from "../tools/bash-session.ts";
import type { DshMinimalConfig } from "./config.ts";

export interface AdapterState {
	enabled: boolean;
	cwd: string;
	previousToolNames?: string[];
	config: DshMinimalConfig;
	shell: PersistentBashSession;
	bashOverrideInstalled: boolean;
}
