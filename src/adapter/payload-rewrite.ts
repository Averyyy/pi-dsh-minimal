import { DSH_MINIMAL_TOOLS, MINIMAL_PROMPT } from "../dsh/official.ts";
import { isGuideText } from "../routing/core.ts";

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactChatCompletionsTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: structuredClone(tool.parameters),
		},
	}));
}

function exactAnthropicTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: structuredClone(tool.parameters),
	}));
}

function exactNamedParameterTools(): Record<string, unknown>[] {
	return DSH_MINIMAL_TOOLS.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: structuredClone(tool.parameters),
	}));
}

function rewriteTools(tools: unknown): unknown {
	if (!Array.isArray(tools)) {
		return exactChatCompletionsTools();
	}
	const first = tools[0];
	if (isObject(first) && first.type === "function" && isObject(first.function)) {
		return exactChatCompletionsTools();
	}
	if (isObject(first) && "input_schema" in first) {
		return exactAnthropicTools();
	}
	if (isObject(first) && typeof first.name === "string" && "parameters" in first) {
		return exactNamedParameterTools();
	}
	return exactChatCompletionsTools();
}

function rewriteInstructionContent(content: unknown, persona: string): unknown {
	if (typeof content === "string") return persona;
	if (!Array.isArray(content)) return persona;
	if (content.length === 1 && isObject(content[0]) && content[0].type === "text") {
		return [{ ...content[0], text: persona }];
	}
	return persona;
}

function rewriteMessages(messages: unknown, persona: string): unknown {
	if (!Array.isArray(messages)) return messages;
	let replaced = false;
	return messages.map((message) => {
		if (replaced || !isObject(message)) return message;
		const role = message.role;
		if (role !== "system" && role !== "developer") return message;
		replaced = true;
		return { ...message, content: rewriteInstructionContent(message.content, persona) };
	});
}

export interface RewriteOptions {
	persona: string;
	rewriteTools: boolean;
}

export function rewriteProviderRequest(payload: unknown, options: RewriteOptions): unknown {
	if (!isObject(payload)) return payload;
	const next: Record<string, unknown> = { ...payload };
	if ("system" in next && (typeof next.system === "string" || Array.isArray(next.system))) {
		next.system = rewriteInstructionContent(next.system, options.persona);
	}
	if ("instructions" in next && typeof next.instructions === "string") {
		next.instructions = options.persona;
	}
	if ("messages" in next) {
		next.messages = rewriteMessages(next.messages, options.persona);
	}
	if (options.rewriteTools) next.tools = rewriteTools(next.tools);
	return next;
}

export function rewriteMinimalProviderRequest(payload: unknown): unknown {
	return rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (isObject(part) && typeof part.text === "string" ? part.text : ""))
		.join("");
}

export function extractRequestSurface(payload: unknown): {
	system?: string;
	toolNames: string[];
	tools: unknown;
	lastUser?: string;
} {
	if (!isObject(payload)) return { toolNames: [], tools: undefined };
	let system: string | undefined;
	if (typeof payload.system === "string") system = payload.system;
	else if (typeof payload.instructions === "string") system = payload.instructions;
	if (system === undefined && Array.isArray(payload.messages)) {
		const first = payload.messages.find(
			(message) => isObject(message) && (message.role === "system" || message.role === "developer"),
		);
		if (isObject(first) && typeof first.content === "string") system = first.content;
	}
	let lastUser: string | undefined;
	if (Array.isArray(payload.messages)) {
		for (let index = payload.messages.length - 1; index >= 0; index--) {
			const message = payload.messages[index];
			if (!isObject(message) || message.role !== "user") continue;
			const text = messageText(message.content);
			if (text.trim()) {
				lastUser = text;
				break;
			}
		}
	}
	const tools = payload.tools;
	const toolNames: string[] = [];
	if (Array.isArray(tools)) {
		for (const tool of tools) {
			if (!isObject(tool)) continue;
			if (isObject(tool.function) && typeof tool.function.name === "string") {
				toolNames.push(tool.function.name);
			} else if (typeof tool.name === "string") {
				toolNames.push(tool.name);
			}
		}
	}
	const messageRoles: string[] = [];
	if (Array.isArray(payload.messages)) {
		for (const message of payload.messages) {
			if (isObject(message) && typeof message.role === "string") messageRoles.push(message.role);
		}
	}
	return { system, toolNames, tools, lastUser, messageRoles };
}

export function countUserRounds(messages: readonly { role?: string; content?: unknown }[]): number {
	let rounds = 0;
	for (const message of messages) {
		if (message.role !== "user") continue;
		const text = typeof message.content === "string" ? message.content : "";
		const extracted =
			text ||
			(Array.isArray(message.content)
				? message.content
						.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
						.join(" ")
				: "");
		if (!extracted.trim() || isGuideText(extracted)) continue;
		rounds += 1;
	}
	return rounds;
}
