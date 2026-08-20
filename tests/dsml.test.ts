import test from "node:test";
import assert from "node:assert/strict";
import { fauxAssistantMessage, fauxProvider, Type, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import { runAgentLoop, type AgentEvent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { convertDsmlAssistantMessage, parseDsmlText } from "../src/adapter/dsml.ts";

const usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(text: string, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-completions",
		provider: "test",
		model: "deepseek-v4-flash",
		usage,
		stopReason,
		timestamp: 1,
		responseId: "response-1",
	};
}

test("parses official DSML parameters with their declared JSON types", () => {
	const text = [
		"<｜DSML｜tool_calls>",
		'<｜DSML｜invoke name="schedule_wait">',
		'<｜DSML｜parameter name="seconds" string="false">30</｜DSML｜parameter>',
		'<｜DSML｜parameter name="reason" string="true">等待 scanner</｜DSML｜parameter>',
		"</｜DSML｜invoke>",
		"</｜DSML｜tool_calls>",
	].join("\n");
	assert.deepEqual(parseDsmlText(text), [
		{ name: "schedule_wait", arguments: { seconds: 30, reason: "等待 scanner" } },
	]);
});

test("parses the anchored leaked wrapper and bare parameter tags", () => {
	const text =
		'<｜DSML｜tool_calls store: <invoke name="schedule_wait"> <parameter name="seconds">30</parameter>' +
		'<parameter name="reason">等待 scanner 执行 task79 停止后处理</parameter> </invoke>' +
		' <invoke name="functions/emit> Done waiting. finished: 2026 put_continuesnya.</para> </tool_self.js>';
	assert.deepEqual(parseDsmlText(text), [
		{ name: "schedule_wait", arguments: { seconds: 30, reason: "等待 scanner 执行 task79 停止后处理" } },
		{ name: "functions/emit", arguments: {} },
	]);
});

test("parses literal Markdown escapes in the observed leaked response", () => {
	const text = [
		String.raw`<｜DSML｜tool\_calls store: \<invoke name="schedule\_wait">`,
		String.raw` \<parameter name="seconds">30\</parameter>`,
		String.raw`\<parameter name="reason">等待 scanner 执行 task79 停止后处理 \</parameter> \</invoke>`,
		String.raw` \<invoke name="functions/emit> Done waiting. finished: 2026 put\_continuesnya.`,
		String.raw`\</para> \</tool\_self.js>`,
	].join("");
	assert.deepEqual(parseDsmlText(text), [
		{ name: "schedule_wait", arguments: { seconds: 30, reason: "等待 scanner 执行 task79 停止后处理 " } },
		{ name: "functions/emit", arguments: {} },
	]);
});

test("converts DSML text into Pi toolCall blocks and removes wrapper artifacts", () => {
	const text =
		'<｜DSML｜tool_calls store: <invoke name="schedule_wait"><parameter name="seconds">30</parameter></invoke>' +
		' <invoke name="functions/emit>Done waiting</para> </tool_self.js>';
	const converted = convertDsmlAssistantMessage(assistant(text));
	assert.ok(converted);
	assert.equal(converted?.role, "assistant");
	assert.equal(converted?.stopReason, "toolUse");
	assert.deepEqual(
		converted?.content.filter((part) => part.type === "toolCall").map((part) => ({ name: part.name, arguments: part.arguments })),
		[
			{ name: "schedule_wait", arguments: { seconds: 30 } },
			{ name: "functions/emit", arguments: {} },
		],
	);
	assert.equal(converted?.content.some((part) => part.type === "text" && part.text.includes("tool_self.js")), false);
	assert.equal(converted?.content.some((part) => part.type === "text" && part.text.includes("Done waiting")), true);
});

test("accepts an unwrapped JSON object invocation at the beginning of a response", () => {
	assert.deepEqual(
		parseDsmlText('<invoke name="bash">{"command":"printf ok"}</invoke>'),
		[{ name: "bash", arguments: { command: "printf ok" } }],
	);
});

test("does not turn ordinary prose or incomplete calls into tool calls", () => {
	assert.deepEqual(parseDsmlText("Here is an <invoke name=\"bash\"> example."), []);
	assert.deepEqual(parseDsmlText('<｜DSML｜tool_calls><invoke name="bash"><parameter name="command">ls'), []);
	assert.deepEqual(parseDsmlText('<｜DSML｜tool_calls><invoke name="bash">{"command":"ls"}</invoke>'), []);
	assert.equal(convertDsmlAssistantMessage(assistant("normal answer")), undefined);
});

test("only converts calls present in Pi's active tool catalog", () => {
	const text =
		'<｜DSML｜tool_calls><invoke name="schedule_wait"><parameter name="seconds">30</parameter></invoke>' +
		'<invoke name="functions/emit">{}</invoke></｜DSML｜tool_calls>';
	const converted = convertDsmlAssistantMessage(assistant(text), [
		{ name: "schedule_wait", parameters: Type.Object({ seconds: Type.Integer() }) },
	]) as AssistantMessage;
	assert.deepEqual(
		converted.content.filter((part) => part.type === "toolCall").map((part) => part.name),
		["schedule_wait"],
	);
	assert.equal(
		converted.content.some((part) => part.type === "text" && part.text.includes('name="functions/emit"')),
		true,
	);
});

test("leaves schema-invalid active calls as text", () => {
	const text = '<invoke name="schedule_wait"><parameter name="reason">missing seconds</parameter></invoke>';
	assert.equal(
		convertDsmlAssistantMessage(assistant(text), [
			{ name: "schedule_wait", parameters: Type.Object({ seconds: Type.Integer() }) },
		]),
		undefined,
	);
});

test("preserves thinking and native tool-call blocks while converting text blocks", () => {
	const message = assistant("<invoke name=\"bash\">{\"command\":\"pwd\"}</invoke>");
	message.content.unshift({ type: "thinking", thinking: "reason" });
	message.content.push({ type: "toolCall", id: "native-1", name: "read", arguments: {} });
	const converted = convertDsmlAssistantMessage(message);
	assert.ok(converted);
	const result = converted as AssistantMessage;
	assert.equal(result.content[0]?.type, "thinking");
	assert.equal(result.content.at(-1)?.type, "toolCall");
	assert.equal((result.content.at(-1) as { id: string }).id, "native-1");
});

test("Pi agent loop executes a DSML call replaced during message_end", async () => {
	const provider = fauxProvider();
	provider.setResponses([
		fauxAssistantMessage(
			[
				"<｜DSML｜tool_calls>",
				'<｜DSML｜invoke name="wait">',
				'<｜DSML｜parameter name="seconds" string="false">30</｜DSML｜parameter>',
				"</｜DSML｜invoke>",
				"</｜DSML｜tool_calls>",
			].join(""),
		),
		fauxAssistantMessage("finished"),
	]);
	let executedWith: unknown;
	const tool: AgentTool = {
		name: "wait",
		label: "wait",
		description: "test wait",
		parameters: Type.Object({ seconds: Type.Integer() }),
		async execute(_toolCallId, params) {
			executedWith = params;
			return { content: [{ type: "text", text: "waited" }], details: undefined };
		},
	};
	const events: AgentEvent[] = [];
	const messages = await runAgentLoop(
		[{ role: "user", content: "wait", timestamp: 0 }],
		{ systemPrompt: "test", messages: [], tools: [tool] },
		{
			model: provider.getModel(),
			convertToLlm: (input) => input as Message[],
		},
		async (event) => {
			events.push(event);
			if (event.type !== "message_end") return;
			const replacement = convertDsmlAssistantMessage(event.message, [tool]);
			if (!replacement) return;
			const target = event.message as unknown as Record<string, unknown>;
			for (const key of Object.keys(target)) delete target[key];
			Object.assign(target, replacement as AgentMessage);
		},
		undefined,
		provider.provider.streamSimple,
	);
	assert.deepEqual(executedWith, { seconds: 30 });
	assert.equal(events.some((event) => event.type === "tool_execution_start" && event.toolName === "wait"), true);
	assert.equal(messages.some((message) => message.role === "toolResult" && message.toolName === "wait"), true);
	assert.equal(
		messages.some(
			(message) =>
				message.role === "assistant" &&
				message.content.some((part) => part.type === "text" && part.text === "finished"),
		),
		true,
	);
});
