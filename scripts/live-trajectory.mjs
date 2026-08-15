#!/usr/bin/env node
/**
 * Live check: DeepSeek V4 Pro + this extension should open thinking with
 * "we need" / "i need", not "let me".
 *
 * Requires a configured Pi model (default opencode-go/deepseek-v4-pro).
 * Uses an isolated PI_CODING_AGENT_DIR so other global extensions cannot
 * rewrite the prompt.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const AGENT_HOME = process.env.PI_CODING_AGENT_DIR_SRC || join(homedir(), ".pi", "agent");
const MODEL = process.env.PI_DSH_MINIMAL_MODEL || "opencode-go/deepseek-v4-pro:max";
const PROMPT =
	process.env.PI_DSH_MINIMAL_PROMPT ||
	"main.py prints hello. Change it so it prints world instead. Inspect the file first, then edit it.";

function copyIfExists(from, to) {
	if (!existsSync(from)) return false;
	mkdirSync(dirname(to), { recursive: true });
	copyFileSync(from, to);
	return true;
}

function extractThinking(events) {
	const texts = [];
	for (const event of events) {
		if (event?.type === "message_end" && event.message?.role === "assistant" && Array.isArray(event.message.content)) {
			for (const block of event.message.content) {
				if (block?.type === "thinking" && typeof block.thinking === "string") texts.push(block.thinking);
				if (block?.type === "text" && typeof block.text === "string" && event.message.content.some((item) => item?.type === "thinking")) {
					// keep thinking only
				}
			}
		}
		if (event?.type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
			// streamed; final message_end is authoritative
		}
	}
	return texts.join("\n\n");
}

function firstLine(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0) ?? "";
}

function classify(thinking) {
	const head = firstLine(thinking).toLowerCase();
	const window = thinking.slice(0, 800).toLowerCase();
	const need = /\b((i|we)\s+need|we\s+(should|have to|must)|need to)\b/.test(window);
	const weStyle = /\bwe\b/.test(window);
	const letMe = /\blet\s+me\b/.test(head) || /^\s*let me\b/i.test(thinking);
	const userWants = /^\s*the user wants\b/i.test(thinking);
	return { head, need, weStyle, letMe, userWants };
}

function runPi(env, args) {
	return new Promise((resolve, reject) => {
		const child = spawn("pi", args, { cwd: env.cwd, env: { ...process.env, ...env.env }, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
	});
}

function parseEvents(stdout) {
	const events = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			events.push(JSON.parse(line));
		} catch {
			// ignore non-json banners
		}
	}
	return events;
}

const isolated = mkdtempSync(join(tmpdir(), "pi-dsh-minimal-live-"));
const dump = join(isolated, "request.json");
const work = join(isolated, "work");
mkdirSync(work);
writeFileSync(join(work, "main.py"), 'print("hello")\n');
copyIfExists(join(AGENT_HOME, "auth.json"), join(isolated, "auth.json"));
copyIfExists(join(AGENT_HOME, "models.json"), join(isolated, "models.json"));
copyIfExists(join(AGENT_HOME, "models-store.json"), join(isolated, "models-store.json"));
writeFileSync(
	join(isolated, "settings.json"),
	`${JSON.stringify(
		{
			packages: [ROOT],
			defaultProvider: "opencode-go",
			defaultModel: "deepseek-v4-pro",
			defaultThinkingLevel: "max",
			defaultProjectTrust: "always",
		},
		null,
		2,
	)}\n`,
);
writeFileSync(
	join(isolated, "pi-dsh-minimal.json"),
	`${JSON.stringify({ enabled: true, statusLine: false, useOnAllModels: false, modelPatterns: ["deepseek-v4-pro"] }, null, 2)}\n`,
);

console.log(`isolated dir: ${isolated}`);
console.log(`model: ${MODEL}`);

const result = await runPi(
	{
		cwd: work,
		env: {
			PI_CODING_AGENT_DIR: isolated,
			PI_DSH_MINIMAL_DUMP: dump,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
		},
	},
	["--mode", "json", "--no-session", "--approve", "--model", MODEL, PROMPT],
);

const eventsPath = join(isolated, "events.jsonl");
writeFileSync(eventsPath, result.stdout);
if (result.stderr) writeFileSync(join(isolated, "stderr.log"), result.stderr);

const events = parseEvents(result.stdout);
const thinking = extractThinking(events);
const { head, need, weStyle, letMe, userWants } = classify(thinking);
let surface;
if (existsSync(dump)) {
	try {
		surface = JSON.parse(readFileSync(dump, "utf8"));
	} catch {
		surface = undefined;
	}
}

console.log("--- request surface ---");
console.log(JSON.stringify(surface ?? "(no dump; extension may not have rewritten)", null, 2));
console.log("--- first thinking line ---");
console.log(head || "(no thinking captured)");
console.log("--- classification ---");
console.log({ need, weStyle, letMe, userWants, exit: result.code });

if (result.code !== 0 && !thinking) {
	console.error(result.stderr.slice(0, 2000));
	process.exit(result.code ?? 1);
}

if (surface) {
	if (surface.system !== "You are a helpful software engineer assistant.") {
		console.error("FAIL: system prompt is not the official minimal persona");
		process.exit(1);
	}
	if (JSON.stringify(surface.toolNames) !== JSON.stringify(["bash", "str_replace_editor"])) {
		console.error(`FAIL: tools were ${JSON.stringify(surface.toolNames)}`);
		process.exit(1);
	}
}

if (!thinking) {
	console.error("FAIL: no thinking text captured");
	process.exit(1);
}
if (letMe && !need) {
	console.error("FAIL: thinking opened with let-me style, not I/we need");
	console.error(thinking.slice(0, 800));
	process.exit(1);
}
if (!need) {
	console.error("FAIL: thinking did not contain I need / we need in the opening window");
	console.error(thinking.slice(0, 800));
	process.exit(1);
}

console.log("PASS: DeepSeek V4 Pro used the official-minimal I/we-need trajectory");
console.log(`events: ${eventsPath}`);
