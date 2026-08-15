import { MINIMAL_PROMPT } from "../dsh/official.ts";

export function minimalSystemPrompt(): string {
	return MINIMAL_PROMPT;
}

export function isMinimalSystemPrompt(value: string | undefined): boolean {
	return value?.trim() === MINIMAL_PROMPT;
}
