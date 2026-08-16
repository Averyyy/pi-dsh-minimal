import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type PromoteOn = "either" | "tool-call" | "assistant-message";

function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
			return "";
		})
		.join(" ");
}

export const PROMOTE_ON_VALUES = ["either", "tool-call", "assistant-message"] as const;

export interface PromotionScan {
	promoted: boolean;
	firstUserText?: string;
	userRounds: number;
	compactionSeq: number;
	hasAssistant: boolean;
	hasTool: boolean;
}

function isPromoteOn(value: string): value is PromoteOn {
	return (PROMOTE_ON_VALUES as readonly string[]).includes(value);
}

export function normalizePromoteOn(value: unknown): PromoteOn {
	if (typeof value === "string" && isPromoteOn(value)) return value;
	return "either";
}

export function isPromoted(signals: { hasAssistant: boolean; hasTool: boolean }, promoteOn: PromoteOn): boolean {
	if (promoteOn === "tool-call") return signals.hasTool;
	if (promoteOn === "assistant-message") return signals.hasAssistant;
	return signals.hasAssistant || signals.hasTool;
}

export function scanSessionPhase(entries: readonly SessionEntry[], promoteOn: PromoteOn): PromotionScan {
	let lastCompactionIndex = -1;
	for (let index = 0; index < entries.length; index++) {
		if (entries[index]?.type === "compaction") lastCompactionIndex = index;
	}

	let firstUserText: string | undefined;
	let userRounds = 0;
	let hasAssistant = false;
	let hasTool = false;

	for (let index = lastCompactionIndex + 1; index < entries.length; index++) {
		const entry = entries[index];
		if (!entry || entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role === "user") {
			const text = extractTextContent(entry.message.content).trim();
			if (!text) continue;
			userRounds += 1;
			if (!firstUserText) firstUserText = text;
			continue;
		}
		if (role === "assistant") {
			hasAssistant = true;
			const content = entry.message.content;
			if (Array.isArray(content) && content.some((part) => part && typeof part === "object" && part.type === "toolCall")) {
				hasTool = true;
			}
			continue;
		}
		if (role === "toolResult") hasTool = true;
	}

	return {
		promoted: isPromoted({ hasAssistant, hasTool }, promoteOn),
		firstUserText,
		userRounds,
		compactionSeq: lastCompactionIndex,
		hasAssistant,
		hasTool,
	};
}
