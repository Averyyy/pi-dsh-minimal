import { DSH_MINIMAL_TOOLS, MINIMAL_PROMPT } from "../dsh/official.ts";

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

function rewriteInstructionContent(content: unknown): unknown {
	if (typeof content === "string") return MINIMAL_PROMPT;
	if (!Array.isArray(content)) return MINIMAL_PROMPT;
	if (content.length === 1 && isObject(content[0]) && content[0].type === "text") {
		return [{ ...content[0], text: MINIMAL_PROMPT }];
	}
	return MINIMAL_PROMPT;
}

function rewriteMessages(messages: unknown): unknown {
	if (!Array.isArray(messages)) return messages;
	let replaced = false;
	return messages.map((message) => {
		if (replaced || !isObject(message)) return message;
		const role = message.role;
		if (role !== "system" && role !== "developer") return message;
		replaced = true;
		return { ...message, content: rewriteInstructionContent(message.content) };
	});
}

export function rewriteMinimalProviderRequest(payload: unknown): unknown {
	if (!isObject(payload)) return payload;
	const next: Record<string, unknown> = { ...payload };
	if ("system" in next && (typeof next.system === "string" || Array.isArray(next.system))) {
		next.system = rewriteInstructionContent(next.system);
	}
	if ("instructions" in next && typeof next.instructions === "string") {
		next.instructions = MINIMAL_PROMPT;
	}
	if ("messages" in next) {
		next.messages = rewriteMessages(next.messages);
	}
	next.tools = rewriteTools(next.tools);
	return next;
}

export function extractRequestSurface(payload: unknown): {
	system?: string;
	toolNames: string[];
	tools: unknown;
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
	return { system, toolNames, tools };
}
