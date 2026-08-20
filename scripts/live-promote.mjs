#!/usr/bin/env node
/**
 * Live check: Pro request #1 is official two-tool bootstrap; the next
 * user turn sees Pi's restored tools (promoted).
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createIsolatedAgent, parseEvents, readDumpSurfaces, runPi } from "./live-harness.mjs";

const MODEL = process.env.PI_DSH_MINIMAL_MODEL || "opencode-go/deepseek-v4-pro:max";
const MINIMAL_PROMPT = "You are a helpful software engineer assistant.";
const PI_IDENTITY = "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
const FIRST =
	process.env.PI_DSH_MINIMAL_PROMPT ||
	"main.py prints hello. Change it so it prints world instead. Inspect the file first, then edit it.";
const SECOND = process.env.PI_DSH_MINIMAL_PROMPT2 || "What tools do you currently have? Reply with just the names.";

const agent = createIsolatedAgent({ prefix: "pi-dsh-minimal-promote-", defaultModel: "deepseek-v4-pro" });
const session = join(agent.sessions, "promote.jsonl");

console.log(`isolated dir: ${agent.isolated}`);
console.log(`model: ${MODEL}`);

const first = await runPi({ cwd: agent.work, env: agent.env }, [
	"--mode",
	"json",
	"--session",
	session,
	"--approve",
	"--model",
	MODEL,
	FIRST,
]);
writeFileSync(join(agent.isolated, "first.jsonl"), first.stdout);
if (first.stderr) writeFileSync(join(agent.isolated, "first.err"), first.stderr);

const afterFirst = readDumpSurfaces(agent.dump);
const bootstrap = afterFirst[0];
console.log("--- first request ---");
console.log(JSON.stringify({ profile: bootstrap?.profile, promoted: bootstrap?.promoted, tools: bootstrap?.toolNames }, null, 2));

if (!bootstrap) {
	console.error(first.stderr.slice(0, 2000));
	console.error("FAIL: no first-request dump");
	process.exit(1);
}
if (bootstrap.system !== MINIMAL_PROMPT) {
	console.error("FAIL: first request persona is not official minimal");
	process.exit(1);
}
if (JSON.stringify(bootstrap.toolNames) !== JSON.stringify(["bash", "str_replace_editor"])) {
	console.error(`FAIL: first request tools were ${JSON.stringify(bootstrap.toolNames)}`);
	process.exit(1);
}
if (bootstrap.promoted === true) {
	console.error("FAIL: first request already promoted");
	process.exit(1);
}

const laterInSameTurn = afterFirst.slice(1);
if (laterInSameTurn.some((surface) => surface.promoted === true && surface.toolNames?.length > 2)) {
	console.log("same-turn follow-up already promoted after first assistant/tool signal");
}

const second = await runPi({ cwd: agent.work, env: agent.env }, [
	"--mode",
	"json",
	"--session",
	session,
	"--approve",
	"--model",
	MODEL,
	SECOND,
]);
writeFileSync(join(agent.isolated, "second.jsonl"), second.stdout);
if (second.stderr) writeFileSync(join(agent.isolated, "second.err"), second.stderr);

const all = readDumpSurfaces(agent.dump);
const promoted = [...all].reverse().find((surface) => surface.promoted === true) ?? all[all.length - 1];
console.log("--- last request ---");
console.log(JSON.stringify({ profile: promoted?.profile, promoted: promoted?.promoted, tools: promoted?.toolNames }, null, 2));

if (!promoted) {
	console.error(second.stderr.slice(0, 2000));
	console.error("FAIL: no second-request dump");
	process.exit(1);
}
if (typeof promoted.system !== "string" || !promoted.system.startsWith(MINIMAL_PROMPT)) {
	console.error("FAIL: promoted persona does not keep the official minimal sentence first");
	process.exit(1);
}
if (promoted.system.includes(PI_IDENTITY)) {
	console.error("FAIL: promoted prompt restored Pi's identity paragraph");
	process.exit(1);
}
if (promoted.promoted !== true) {
	console.error("FAIL: later request did not promote");
	console.error(JSON.stringify(all, null, 2));
	process.exit(1);
}
if (!Array.isArray(promoted.toolNames) || promoted.toolNames.length <= 2) {
	console.error(`FAIL: promoted tools still look like bootstrap: ${JSON.stringify(promoted.toolNames)}`);
	process.exit(1);
}
if (!promoted.toolNames.includes("read") && !promoted.toolNames.includes("edit") && !promoted.toolNames.includes("write")) {
	console.error(`FAIL: promoted catalog missing Pi file tools: ${JSON.stringify(promoted.toolNames)}`);
	process.exit(1);
}

const firstEvents = parseEvents(first.stdout);
if (first.code !== 0 && firstEvents.length === 0) {
	console.error(first.stderr.slice(0, 2000));
	process.exit(first.code ?? 1);
}

console.log("PASS: Pro bootstrapped on two official tools, then restored Pi tools");
console.log(`dumps: ${agent.dump}`);
