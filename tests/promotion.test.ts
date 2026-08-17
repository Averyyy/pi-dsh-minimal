import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { isPromoted, scanSessionPhase } from "../src/adapter/promotion.ts";

function user(id: string, text: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: { role: "user", content: text, timestamp: 1 },
	};
}

function assistant(id: string, withTool = false): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: {
			role: "assistant",
			content: withTool
				? [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } }]
				: [{ type: "text", text: "done" }],
			timestamp: 2,
			api: "openai-completions",
			provider: "opencode-go",
			model: "deepseek-v4-pro",
			usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
			stopReason: "stop",
		},
	};
}

function toolResult(id: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: {
			role: "toolResult",
			toolCallId: "c1",
			toolName: "bash",
			content: [{ type: "text", text: "ok" }],
			isError: false,
			timestamp: 3,
		},
	};
}

function compact(id: string): SessionEntry {
	return {
		type: "compaction",
		id,
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		summary: "summary",
		firstKeptEntryId: id,
		tokensBefore: 100,
	};
}

test("empty session is unpromoted", () => {
	const scan = scanSessionPhase([], "either");
	assert.equal(scan.promoted, false);
	assert.equal(scan.userRounds, 0);
	assert.equal(scan.firstUserText, undefined);
});

test("first user message alone does not promote", () => {
	const scan = scanSessionPhase([user("u1", "fix main.py")], "either");
	assert.equal(scan.promoted, false);
	assert.equal(scan.userRounds, 1);
	assert.equal(scan.firstUserText, "fix main.py");
});

test("either promotes after the first assistant message", () => {
	const scan = scanSessionPhase([user("u1", "fix main.py"), assistant("a1")], "either");
	assert.equal(scan.promoted, true);
	assert.equal(scan.hasAssistant, true);
	assert.equal(scan.hasTool, false);
});

test("tool-call does not promote on a text-only first reply", () => {
	const scan = scanSessionPhase([user("u1", "hi"), assistant("a1")], "tool-call");
	assert.equal(scan.promoted, false);
});

test("tool-call promotes after a tool result", () => {
	const scan = scanSessionPhase([user("u1", "fix"), assistant("a1", true), toolResult("t1")], "tool-call");
	assert.equal(scan.promoted, true);
	assert.equal(scan.hasTool, true);
});

test("compaction starts a new epoch", () => {
	const scan = scanSessionPhase(
		[user("u1", "old"), assistant("a1"), compact("c1"), user("u2", "continue")],
		"either",
	);
	assert.equal(scan.promoted, false);
	assert.equal(scan.userRounds, 1);
	assert.equal(scan.firstUserText, "continue");
	assert.ok(scan.compactionSeq >= 0);
});

test("empty user messages do not count as rounds", () => {
	const scan = scanSessionPhase([user("u1", "fix the crash"), user("u2", "   ")], "either");
	assert.equal(scan.userRounds, 1);
	assert.equal(scan.firstUserText, "fix the crash");
});

test("isPromoted matches promoteOn", () => {
	assert.equal(isPromoted({ hasAssistant: true, hasTool: false }, "either"), true);
	assert.equal(isPromoted({ hasAssistant: true, hasTool: false }, "tool-call"), false);
	assert.equal(isPromoted({ hasAssistant: false, hasTool: true }, "assistant-message"), false);
	assert.equal(isPromoted({ hasAssistant: false, hasTool: true }, "either"), true);
});
