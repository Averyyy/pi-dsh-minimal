#!/usr/bin/env node
/**
 * Live check: V4 Flash uses the weak/mode-boost persona and near-field
 * classify guidance, without clamping to the two-tool official catalog.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createIsolatedAgent, extractThinking, firstLine, parseEvents, readDumpSurfaces, runPi } from "./live-harness.mjs";

const WEAK_FLASH_HEAD = "You are a helpful assistant.";
const WEAK_FLASH_MARK = "Think deeply first, then produce.";

const MODEL = process.env.PI_DSH_FLASH_MODEL || "opencode-go/deepseek-v4-flash:max";
const PROMPT =
	process.env.PI_DSH_FLASH_PROMPT ||
	"main.py prints hello. Change it so it prints world instead. Inspect the file first, then edit it.";

const agent = createIsolatedAgent({ prefix: "pi-dsh-minimal-flash-", defaultModel: "deepseek-v4-flash" });
console.log(`isolated dir: ${agent.isolated}`);
console.log(`model: ${MODEL}`);

const result = await runPi({ cwd: agent.work, env: agent.env }, [
	"--mode",
	"json",
	"--no-session",
	"--approve",
	"--model",
	MODEL,
	PROMPT,
]);
writeFileSync(join(agent.isolated, "events.jsonl"), result.stdout);
if (result.stderr) writeFileSync(join(agent.isolated, "stderr.log"), result.stderr);

const surfaces = readDumpSurfaces(agent.dump);
const surface = surfaces[0];
const events = parseEvents(result.stdout);
const thinking = extractThinking(events);
const head = firstLine(thinking);

console.log("--- request surface ---");
console.log(
	JSON.stringify(
		{
			profile: surface?.profile,
			promoted: surface?.promoted,
			systemHead: surface?.system?.split("\n")[0],
			tools: surface?.toolNames,
			lastUserTail: surface?.lastUser?.slice(-180),
		},
		null,
		2,
	),
);
console.log("--- first thinking line ---");
console.log(head || "(no thinking captured)");

if (result.code !== 0 && !surface) {
	console.error(result.stderr.slice(0, 2000));
	process.exit(result.code ?? 1);
}
if (!surface) {
	console.error("FAIL: no request dump");
	process.exit(1);
}
if (surface.profile !== "flash") {
	console.error(`FAIL: profile was ${surface.profile}`);
	process.exit(1);
}
if (!String(surface.system || "").startsWith(WEAK_FLASH_HEAD) || !String(surface.system || "").includes(WEAK_FLASH_MARK)) {
	console.error("FAIL: system prompt is not the measured Flash weak persona");
	console.error(surface.system?.slice(0, 400));
	process.exit(1);
}
if (!Array.isArray(surface.toolNames) || surface.toolNames.length <= 2) {
	console.error(`FAIL: Flash should keep Pi tools, got ${JSON.stringify(surface.toolNames)}`);
	process.exit(1);
}
if (JSON.stringify(surface.toolNames) === JSON.stringify(["bash", "str_replace_editor"])) {
	console.error("FAIL: Flash was incorrectly clamped to the official two-tool catalog");
	process.exit(1);
}
if (!String(surface.lastUser || "").includes("Router: classify this task")) {
	console.error("FAIL: near-field Flash guidance missing from the user message");
	console.error(surface.lastUser);
	process.exit(1);
}

console.log("PASS: DeepSeek V4 Flash used weak/mode-boost persona + guidance on Pi tools");
console.log(`dump: ${agent.dump}`);
