import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { validateToolArguments, type AssistantMessage, type Tool, type ToolCall } from "@earendil-works/pi-ai";

/** DeepSeek V4's markup token used in the official text tool-call format. */
const DSML = "｜DSML｜";

type TagStyle = "dsml" | "bare";
type CallIdentity = Pick<AssistantMessage, "responseId" | "timestamp">;

export interface DsmlActiveTool {
	name: string;
	description?: string;
	parameters: Tool["parameters"];
}

interface ParsedCall {
	name: string;
	arguments: Record<string, unknown>;
	start: number;
	end: number;
	/** Plain body retained after a legacy, body-only invocation. */
	bodyText?: string;
}

interface ParsedRegion {
	calls: ParsedCall[];
}

interface TagEnd {
	index: number;
	closedQuote: boolean;
}

interface ParsedAttributes {
	name?: string;
	stringMode?: "true" | "false";
}

interface CandidateOpen {
	style: TagStyle;
	kind: "block" | "invoke" | "parameter";
	start: number;
	end: number;
	unterminatedBlock?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tag(style: TagStyle, kind: "tool_calls" | "invoke" | "parameter", closing = false): string {
	const prefix = style === "dsml" ? DSML : "";
	return `<${closing ? "/" : ""}${prefix}${kind}>`;
}

function openPrefix(style: TagStyle, kind: "invoke" | "parameter"): string {
	const prefix = style === "dsml" ? DSML : "";
	return `<${prefix}${kind}`;
}

function skipWhitespace(text: string, index: number): number {
	while (index < text.length && /\s/u.test(text[index] ?? "")) index += 1;
	return index;
}

/**
 * Find a tag's closing `>` without treating a `>` inside a quoted attribute as
 * the end of the tag. An unclosed quote is reported to the caller so the
 * explicitly supported legacy recovery form can be handled without changing
 * the normal grammar.
 */
function findTagEnd(text: string, start: number, allowLegacyUnclosedNameQuote = false): TagEnd | undefined {
	let quote: "'" | '"' | undefined;
	for (let index = start; index < text.length; index += 1) {
		const character = text[index];
		if (quote) {
			if (character === quote) quote = undefined;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (character === ">") return { index, closedQuote: true };
	}
	if (allowLegacyUnclosedNameQuote) {
		const end = text.indexOf(">", start);
		if (end >= 0 && /^\s+name\s*=\s*["'][^"']*$/u.test(text.slice(start, end))) {
			return { index: end, closedQuote: false };
		}
	}
	return undefined;
}

function parseAttributes(source: string, allowLegacyUnclosedNameQuote: boolean): ParsedAttributes | undefined {
	let index = 0;
	let name: string | undefined;
	let stringMode: "true" | "false" | undefined;

	while (index < source.length) {
		index = skipWhitespace(source, index);
		if (index >= source.length) break;

		const keyStart = index;
		while (index < source.length && !/[\s=]/u.test(source[index] ?? "")) index += 1;
		const key = source.slice(keyStart, index);
		if (!key) return undefined;
		index = skipWhitespace(source, index);
		if (source[index] !== "=") return undefined;
		index = skipWhitespace(source, index + 1);
		if (index >= source.length) return undefined;

		let value: string;
		const quote = source[index];
		if (quote === '"' || quote === "'") {
			const valueStart = index + 1;
			const valueEnd = source.indexOf(quote, valueStart);
			if (valueEnd < 0) {
				if (!allowLegacyUnclosedNameQuote || key !== "name") return undefined;
				value = source.slice(valueStart);
				index = source.length;
			} else {
				value = source.slice(valueStart, valueEnd);
				index = valueEnd + 1;
			}
		} else {
			const valueStart = index;
			while (index < source.length && !/\s/u.test(source[index] ?? "")) index += 1;
			value = source.slice(valueStart, index);
		}

		if (key === "name") {
			if (name !== undefined) return undefined;
			name = value;
		} else if (key === "string") {
			if (stringMode !== undefined || (value !== "true" && value !== "false")) return undefined;
			stringMode = value;
		} else {
			// The official grammar has only `name` and `string` attributes. Reject
			// unknown attributes so an accidental prose fragment cannot become a call.
			return undefined;
		}
	}

	return { name, stringMode };
}

function decodeParameterValue(value: string, stringMode: "true" | "false" | undefined): unknown {
	if (stringMode === "true") return value;
	const trimmed = value.trim();
	if (stringMode === "false") {
		try {
			return JSON.parse(trimmed);
		} catch {
			throw new Error(`DSML parameter is not valid JSON: ${trimmed.slice(0, 120)}`);
		}
	}

	// Legacy bare `<parameter>` tags did not carry the official string flag.
	// Decode JSON values when unambiguous; otherwise retain the value as text.
	if (trimmed.length === 0) return "";
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

function findOpeningTag(text: string, from: number, kind: "block" | "invoke" | "parameter"): CandidateOpen | undefined {
	const candidates: CandidateOpen[] = [];
	const styles: TagStyle[] = ["dsml", "bare"];
	for (const style of styles) {
		const prefix = kind === "block" ? `<${style === "dsml" ? DSML : ""}tool_calls` : openPrefix(style, kind);
		const index = text.indexOf(prefix, from);
		if (index < 0) continue;
		if (kind === "block" && style === "dsml") {
			const label = text.slice(index + prefix.length).match(/^\s+store:\s*/u);
			if (label) {
				candidates.push({
					style,
					kind,
					start: index,
					end: index + prefix.length + label[0].length,
					unterminatedBlock: true,
				});
				continue;
			}
		}
		const end = findTagEnd(text, index + prefix.length, kind === "invoke");
		if (end) {
			candidates.push({ style, kind, start: index, end: end.index + 1 });
			continue;
		}
	}
	return candidates.sort((a, b) => a.start - b.start)[0];
}

function closingTagCandidates(style: TagStyle, kind: "tool_calls" | "invoke" | "parameter"): string[] {
	const alternate: TagStyle = style === "dsml" ? "bare" : "dsml";
	return [tag(style, kind, true), tag(alternate, kind, true)];
}

function findClosingTag(text: string, from: number, style: TagStyle, kind: "tool_calls" | "invoke" | "parameter"): {
	index: number;
	end: number;
	value: string;
} | undefined {
	const matches = closingTagCandidates(style, kind)
		.map((candidate) => ({ value: candidate, index: text.indexOf(candidate, from) }))
		.filter((match) => match.index >= 0)
		.sort((a, b) => a.index - b.index);
	const match = matches[0];
	return match ? { ...match, end: match.index + match.value.length } : undefined;
}

function findLegacyInvocationBoundary(text: string, from: number, regionEnd: number): number | undefined {
	const candidates = [
		"</para>",
		"</tool_self.js>",
		"<｜end▁of▁sentence｜>",
		"<|end_of_sentence|>",
		"</｜DSML｜tool_calls>",
		"</tool_calls>",
	];
	for (const style of ["dsml", "bare"] as const) {
		candidates.push(openPrefix(style, "invoke"));
	}
	const positions = candidates
		.map((candidate) => text.indexOf(candidate, from))
		.filter((index) => index >= 0 && index < regionEnd);
	return positions.length > 0 ? Math.min(...positions) : undefined;
}

function parseInvocation(text: string, open: CandidateOpen, regionEnd: number): ParsedCall | undefined {
	const tagEnd = findTagEnd(text, open.start + openPrefix(open.style, "invoke").length, true);
	if (!tagEnd || tagEnd.index + 1 > regionEnd) return undefined;
	const attributes = parseAttributes(
		text.slice(open.start + openPrefix(open.style, "invoke").length, tagEnd.index),
		true,
	);
	const name = attributes?.name?.trim();
	if (!attributes || !name) return undefined;

	const close = findClosingTag(text, tagEnd.index + 1, open.style, "invoke");
	const legacyBoundary =
		!close && !tagEnd.closedQuote ? findLegacyInvocationBoundary(text, tagEnd.index + 1, regionEnd) : undefined;
	if ((!close && legacyBoundary === undefined) || (close && close.end > regionEnd)) return undefined;
	const bodyEnd = close?.index ?? legacyBoundary!;

	const arguments_: Record<string, unknown> = {};
	let cursor = tagEnd.index + 1;
	let valid = true;
	let parameterCount = 0;
	while (cursor < bodyEnd) {
		const parameter = findOpeningTag(text, cursor, "parameter");
		if (!parameter || parameter.start >= bodyEnd) {
			if (parameterCount > 0 && text.slice(cursor, bodyEnd).trim()) valid = false;
			break;
		}
		if (text.slice(cursor, parameter.start).trim()) valid = false;
		const parameterTagEnd = findTagEnd(text, parameter.start + openPrefix(parameter.style, "parameter").length);
		if (!parameterTagEnd || parameterTagEnd.index >= bodyEnd) {
			valid = false;
			break;
		}
		const parameterAttributes = parseAttributes(
			text.slice(parameter.start + openPrefix(parameter.style, "parameter").length, parameterTagEnd.index),
			false,
		);
		const parameterName = parameterAttributes?.name;
		if (!parameterAttributes || !parameterName || parameterName.trim().length === 0) {
			valid = false;
			break;
		}
		const parameterClose = findClosingTag(text, parameterTagEnd.index + 1, parameter.style, "parameter");
		if (!parameterClose || parameterClose.index > bodyEnd) {
			valid = false;
			break;
		}
		if (Object.prototype.hasOwnProperty.call(arguments_, parameterName)) {
			valid = false;
			break;
		}
		try {
			arguments_[parameterName] = decodeParameterValue(
				text.slice(parameterTagEnd.index + 1, parameterClose.index),
				parameterAttributes.stringMode,
			);
		} catch {
			valid = false;
			break;
		}
		parameterCount += 1;
		cursor = parameterClose.end;
	}

	if (!valid) return undefined;
	let bodyText: string | undefined;
	if (parameterCount === 0) {
		const rawBody = text.slice(tagEnd.index + 1, bodyEnd);
		const trimmedBody = rawBody.trim();
		if (trimmedBody) {
			try {
				const parsedBody: unknown = JSON.parse(trimmedBody);
				if (!isRecord(parsedBody)) return undefined;
				Object.assign(arguments_, parsedBody);
			} catch {
				if (!legacyBoundary) return undefined;
				bodyText = trimmedBody;
			}
		}
	}
	return {
		name,
		arguments: arguments_,
		start: open.start,
		end: close?.end ?? bodyEnd,
		...(bodyText ? { bodyText } : {}),
	};
}

function parseRegion(text: string, start: number, end: number): ParsedRegion {
	const calls: ParsedCall[] = [];
	let cursor = start;
	while (cursor < end) {
		const open = findOpeningTag(text, cursor, "invoke");
		if (!open || open.start >= end) break;
		const call = parseInvocation(text, open, end);
		if (!call) {
			// Keep an incomplete or invalid invocation visible. A valid earlier call
			// may still be executed, but malformed arguments are never synthesized.
			break;
		}
		calls.push(call);
		cursor = call.end;
	}
	return { calls };
}

function acceptedCalls(
	calls: ParsedCall[],
	activeTools: ReadonlyMap<string, DsmlActiveTool> | undefined,
): ParsedCall[] {
	if (!activeTools) return calls;
	return calls.flatMap((call) => {
		const activeTool = activeTools.get(call.name);
		if (!activeTool) return [];
		try {
			const arguments_ = validateToolArguments(
				{
					name: activeTool.name,
					description: activeTool.description ?? "",
					parameters: activeTool.parameters,
				},
				{ type: "toolCall", id: "dsml-validation", name: call.name, arguments: call.arguments },
			);
			return isRecord(arguments_) ? [{ ...call, arguments: arguments_ }] : [];
		} catch {
			return [];
		}
	});
}

function candidateBlock(text: string, from: number): CandidateOpen | undefined {
	return findOpeningTag(text, from, "block");
}

function hasBareInvocationAtStart(text: string): boolean {
	const start = skipWhitespace(text, 0);
	return text.startsWith(openPrefix("bare", "invoke"), start);
}

function legacyArtifactTail(text: string, from: number): { start: number; end: number } | undefined {
	const start = ["</para>", "</tool_self.js>"]
		.map((token) => text.indexOf(token, from))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];
	if (start === undefined) return undefined;
	const tail = text.slice(start);
	if (!/^<\/(?:para|tool_self\.js)>\s*(?:<\/(?:para|tool_self\.js)>\s*)*$/u.test(tail)) return undefined;
	return { start, end: text.length };
}

interface NormalizedMarkup {
	text: string;
	/** Map a normalized string boundary back to the corresponding source boundary. */
	toSource: number[];
}

function recognizedEscapedTag(text: string, slashIndex: number): boolean {
	return /^\\?<\/?(?:(?:｜DSML｜)?(?:tool\\?_calls|invoke|parameter)|para|tool\\?_self\.js)>?/u.test(
		text.slice(slashIndex),
	);
}

/**
 * Pi/Markdown transcripts sometimes preserve the model's display escapes as
 * literal backslashes (`\<invoke`, `tool\_calls`). Remove those escapes only
 * inside recognized tag heads. Parameter bodies are never normalized.
 */
function normalizeMarkupEscapes(source: string): NormalizedMarkup {
	let text = "";
	const toSource: number[] = [0];
	let inRecognizedTag = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index] ?? "";
		if (character === "\\" && source[index + 1] === "<" && recognizedEscapedTag(source, index)) {
			continue;
		}
		if (character === "<" && recognizedEscapedTag(source, index)) inRecognizedTag = true;
		if (character === "\\" && source[index + 1] === "_" && inRecognizedTag) continue;
		text += character;
		toSource.push(index + 1);
		if (inRecognizedTag && character === ">") inRecognizedTag = false;
		if (inRecognizedTag && /<｜DSML｜tool_calls\s+store:\s*$/u.test(text.slice(-80))) inRecognizedTag = false;
	}
	return { text, toSource };
}

function makeCallId(message: CallIdentity, index: number): string {
	const source = message.responseId?.trim() || String(message.timestamp);
	const safe = source.replace(/[^A-Za-z0-9_.-]/gu, "_").slice(0, 80) || "response";
	return `dsml-${safe}-${index}`;
}

/**
 * Parse one assistant text block and return replacement text/tool-call blocks.
 * The parser is deliberately gated by an official tool_calls wrapper or by a
 * bare invocation at the beginning of the whole text, so ordinary prose/code
 * containing an `<invoke>` example is not executed.
 */
function convertTextBlock(
	text: string,
	message: CallIdentity,
	idOffset: number,
	activeTools?: ReadonlyMap<string, DsmlActiveTool>,
): {
	parts: Array<{ type: "text"; text: string } | ToolCall>;
	count: number;
} {
	const sourceText = text;
	const normalized = normalizeMarkupEscapes(sourceText);
	text = normalized.text;
	const toSource = (index: number): number => normalized.toSource[index] ?? sourceText.length;
	const block = candidateBlock(text, 0);
	const bareOnly = !block && hasBareInvocationAtStart(text);
	if (!block && !bareOnly) return { parts: [{ type: "text", text: sourceText }], count: 0 };

	let calls: ParsedCall[] = [];
	let removedRanges: Array<{ start: number; end: number }> = [];
	if (block) {
		const close = block.unterminatedBlock
			? undefined
			: findClosingTag(text, block.end, block.style, "tool_calls");
		if (!block.unterminatedBlock && !close) return { parts: [{ type: "text", text: sourceText }], count: 0 };
		const regionEnd = close?.index ?? text.length;
		const parsed = parseRegion(text, block.end, regionEnd);
		calls = acceptedCalls(parsed.calls, activeTools)
			.map((call) => ({ ...call, start: toSource(call.start), end: toSource(call.end) }));
		if (calls.length > 0) {
			removedRanges = [
				{ start: toSource(block.start), end: toSource(block.end) },
				...(close ? [{ start: toSource(close.index), end: toSource(close.end) }] : []),
				...calls.map((call) => ({ start: call.start, end: call.end })),
			];
			if (block.unterminatedBlock) {
				const artifact = legacyArtifactTail(text, block.end);
				if (artifact) removedRanges.push({ start: toSource(artifact.start), end: toSource(artifact.end) });
			}
		}
	} else {
		const parsed = parseRegion(text, 0, text.length);
		calls = acceptedCalls(parsed.calls, activeTools)
			.map((call) => ({ ...call, start: toSource(call.start), end: toSource(call.end) }));
		removedRanges = calls.map((call) => ({ start: call.start, end: call.end }));
	}

	if (calls.length === 0) return { parts: [{ type: "text", text: sourceText }], count: 0 };

	removedRanges.sort((a, b) => a.start - b.start || a.end - b.end);
	const parts: Array<{ type: "text"; text: string } | ToolCall> = [];
	let cursor = 0;
	let callIndex = idOffset;
	let rangeIndex = 0;
	for (const call of calls) {
		while (rangeIndex < removedRanges.length && removedRanges[rangeIndex].end <= call.start) {
			const range = removedRanges[rangeIndex];
			if (range.start > cursor) parts.push({ type: "text", text: sourceText.slice(cursor, range.start) });
			cursor = Math.max(cursor, range.end);
			rangeIndex += 1;
		}
		if (call.start > cursor) parts.push({ type: "text", text: sourceText.slice(cursor, call.start) });
		parts.push({ type: "toolCall", id: makeCallId(message, callIndex), name: call.name, arguments: call.arguments });
		callIndex += 1;
		cursor = call.end;
		if (call.bodyText) parts.push({ type: "text", text: call.bodyText });
	}
	while (rangeIndex < removedRanges.length) {
		const range = removedRanges[rangeIndex];
		if (range.start > cursor) parts.push({ type: "text", text: sourceText.slice(cursor, range.start) });
		cursor = Math.max(cursor, range.end);
		rangeIndex += 1;
	}
	if (cursor < sourceText.length) parts.push({ type: "text", text: sourceText.slice(cursor) });
	return { parts, count: calls.length };
}

/**
 * Convert text-form DeepSeek DSML calls in a finalized assistant message into
 * Pi-native tool-call content. Returns `undefined` when no complete call was
 * found, which lets the extension leave the original message untouched.
 */
export function convertDsmlAssistantMessage(
	message: AgentMessage,
	activeTools?: readonly DsmlActiveTool[],
): AssistantMessage | undefined {
	if (message.role !== "assistant" || !Array.isArray(message.content)) return undefined;
	const assistant = message as AssistantMessage;
	let changed = false;
	let nextId = 0;
	const activeToolMap = activeTools ? new Map(activeTools.map((tool) => [tool.name, tool])) : undefined;
	const content: AssistantMessage["content"] = [];
	for (const part of assistant.content) {
		if (part.type !== "text") {
			content.push(part);
			continue;
		}
		const converted = convertTextBlock(part.text, assistant, nextId, activeToolMap);
		if (converted.count === 0) {
			content.push(part);
			continue;
		}
		changed = true;
		nextId += converted.count;
		content.push(...converted.parts);
	}
	if (!changed) return undefined;
	return {
		...assistant,
		content,
		stopReason: assistant.stopReason === "stop" || assistant.stopReason === "pending" ? "toolUse" : assistant.stopReason,
	};
}

/** Exported for focused parser tests and downstream integrations. */
export const parseDsmlText = (text: string): Array<{ name: string; arguments: Record<string, unknown> }> => {
	const fakeMessage: CallIdentity = { timestamp: 0, responseId: "parse" };
	const converted = convertTextBlock(text, fakeMessage, 0);
	return converted.parts.filter((part): part is ToolCall => part.type === "toolCall").map((part) => ({
		name: part.name,
		arguments: part.arguments,
	}));
};
