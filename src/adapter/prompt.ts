import { MINIMAL_PROMPT } from "../dsh/official.ts";
import { personaFor, type RouterMode } from "../routing/core.ts";

export function minimalSystemPrompt(): string {
	return MINIMAL_PROMPT;
}

export function isMinimalSystemPrompt(value: string | undefined): boolean {
	return value?.trim() === MINIMAL_PROMPT;
}

export function flashSystemPrompt(mode: RouterMode, modelId?: string): string {
	return personaFor(mode, modelId);
}
