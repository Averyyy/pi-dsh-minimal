import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { extractTextContent, guideFor, isGuideText } from "../routing/core.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function injectFlashGuidance(
	messages: AgentMessage[],
	modelId: string | undefined,
): AgentMessage[] | undefined {
	let lastUserIndex = -1;
	let userRounds = 0;
	for (let index = 0; index < messages.length; index++) {
		const message = messages[index];
		if (!message || message.role !== "user") continue;
		const text = extractTextContent(message.content);
		if (!text.trim() || isGuideText(text)) continue;
		userRounds += 1;
		lastUserIndex = index;
	}
	if (lastUserIndex < 0 || userRounds === 0) return undefined;

	const lastUser = messages[lastUserIndex];
	if (!lastUser || lastUser.role !== "user") return undefined;
	const lastText = extractTextContent(lastUser.content);
	if (isGuideText(lastText)) return undefined;

	const next = messages[lastUserIndex + 1];
	if (next?.role === "user" && isGuideText(extractTextContent(next.content))) return undefined;

	const guide = guideFor(userRounds, lastText, modelId);
	const nextMessages = messages.slice();
	const content = lastUser.content;
	if (typeof content === "string") {
		nextMessages[lastUserIndex] = { ...lastUser, content: content + guide };
		return nextMessages;
	}
	if (Array.isArray(content)) {
		nextMessages[lastUserIndex] = {
			...lastUser,
			content: [...content, { type: "text", text: guide }],
		};
		return nextMessages;
	}
	if (isRecord(lastUser)) {
		nextMessages[lastUserIndex] = { ...lastUser, content: lastText + guide } as AgentMessage;
		return nextMessages;
	}
	return undefined;
}
