#!/usr/bin/env node
/**
 * Local DeepSWE A/B harness: run a DeepSWE task subset through the pi CLI
 * (opencode-go/deepseek-v4-flash:max) with pi-dsh-minimal enabled vs
 * disabled, then grade with the task's official verifier. The ONLY variable
 * between arms is the extension's `enabled` flag.
 *
 * Usage:
 *   node scripts/deepswe/ab-run.mjs --task abs-stepped-slices --arm plugin
 *   node scripts/deepswe/ab-run.mjs --task abs-stepped-slices --arm baseline
 *   node scripts/deepswe/ab-run.mjs --task abs-stepped-slices --arm both
 *   node scripts/deepswe/ab-run.mjs --verify-only --task <task> [--arm ...]
 *
 * Env knobs:
 *   PI_DSH_AGENT_TIMEOUT_SEC  (default 5400, official agent budget)
 *   PI_DSH_MODEL              (default opencode-go/deepseek-v4-flash:max)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { docker, dockerIn, readTask, writeAgentHome, RUNS_DIR, ROOT, mountArgs } from "./common.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : undefined;
};
const TASK = flag("task");
const armFlag = flag("arm");
const ARMS = !armFlag || armFlag === "both" ? ["plugin", "baseline"] : armFlag.split(",").map((s) => s.trim());
const VERIFY_ONLY = args.includes("--verify-only");
const AGENT_TIMEOUT_SEC = Number(process.env.PI_DSH_AGENT_TIMEOUT_SEC || 5400);
const MODEL = process.env.PI_DSH_MODEL || "opencode-go/deepseek-v4-flash:max";
// TAG separates A/B experiments (run dirs + summary file), e.g. "flash",
// "flash-propath" (Pro minimal bootstrap forced onto Flash), "pro".
const TAG = process.env.PI_DSH_TAG || "flash";
// "1" sets useOnAllModels in the plugin config so non-Pro models (e.g.
// deepseek-v4-flash) go through the Pro anchored-standard profile.
const USE_ON_ALL = process.env.PI_DSH_USE_ON_ALL === "1";

if (!TASK) {
	console.error("usage: ab-run.mjs --task <task-id> [--arm plugin|baseline|both] [--verify-only]");
	process.exit(2);
}

const task = readTask(TASK);
const imageTag = `dsh-agent:${TASK}`;
const verifyTag = `dsh-verify:${TASK}`;

function log(msg) {
	console.log(`[${TASK}] ${msg}`);
}

async function buildImages() {
	// agent image: env image + pi CLI (cached)
	const dockerfile = [
		`FROM ${task.image}`,
		`RUN npm install -g --no-audit --no-fund @earendil-works/pi-coding-agent@0.84.2`,
	].join("\n");
	const taskRoot = join(RUNS_DIR, TAG, TASK);
	const tmp = taskRoot;
	mkdirSync(tmp, { recursive: true });
	writeFileSync(join(tmp, "agent.Dockerfile"), dockerfile + "\n");
	await docker(["build", "-t", imageTag, "-f", join(tmp, "agent.Dockerfile"), tmp]);
	// verifier image: official tests/ build, but re-encoded to LF — the Windows
	// git checkout gives the scripts CRLF, which breaks bash inside the image
	const ctx = join(RUNS_DIR, TAG, TASK, "verify-ctx");
	mkdirSync(join(ctx, "tests"), { recursive: true });
	for (const f of ["Dockerfile", "test.sh", "test.patch", "grader.py", "config.json"]) {
		const src = join(task.dir, "tests", f);
		if (existsSync(src))
			writeFileSync(join(ctx, "tests", f), readFileSync(src, "utf8").replace(/\r\n/g, "\n"));
	}
	await docker(["build", "-t", verifyTag, join(ctx, "tests")]);
}

async function runArm(arm) {
	const runDir = join(RUNS_DIR, TAG, TASK, arm);
	if (VERIFY_ONLY) return verify(arm, runDir);
	mkdirSync(runDir, { recursive: true });
	const home = writeAgentHome(runDir, { enabled: arm === "plugin", useOnAllModels: USE_ON_ALL });
	const cname = `dsw-${TASK}-${arm}`;
	await docker(["rm", "-f", cname]).catch(() => {});
	log(`${arm}: starting container (enabled=${arm === "plugin"})`);
	await docker([
		"run",
		"-d",
		"--name",
		cname,
		"--cpus=2",
		"--memory=8g",
		...mountArgs(home, "/pi-home"),
		...mountArgs(ROOT, "/plugin", true),
		"-w",
		"/app",
		imageTag,
		"sleep",
		"infinity",
	]);

	const env = {
		PI_CODING_AGENT_DIR: "/pi-home",
		PI_DSH_MINIMAL_DUMP: "/pi-home/request-dump.jsonl",
		PI_OFFLINE: "1",
		PI_SKIP_VERSION_CHECK: "1",
		HOME: "/root",
	};
	const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
	const started = Date.now();
	let rc = -1;
	let stdout = "";
	let stderr = "";
	let timedOut = false;
	try {
		// Instructions that START WITH "-" would be parsed as unknown CLI
		// options (pi has no "--" separator) — route those through stdin
		// with -p instead of as a positional arg.
		const viaStdin = task.instruction.startsWith("-");
		const res = await docker(
			[
				"exec",
				...(viaStdin ? ["-i"] : []),
				...envArgs,
				cname,
				"timeout",
				"--signal=INT",
				"--kill-after=60",
				`${AGENT_TIMEOUT_SEC}`,
				"pi",
				"--mode",
				"json",
				"--no-session",
				"--approve",
				"--model",
				MODEL,
				...(viaStdin ? ["-p"] : [task.instruction]),
			],
			viaStdin ? { input: `${task.instruction}\n` } : undefined,
		);
		rc = 0;
		stdout = res.stdout;
		stderr = res.stderr;
	} catch (err) {
		rc = err.code ?? 1;
		stdout = err.stdout || "";
		stderr = err.stderr || "";
		if (/signal 2|timed out|exit code 124/.test(String(err.message) + stderr)) timedOut = true;
	}
	const elapsedMin = Math.round(((Date.now() - started) / 60000) * 10) / 10;
	writeFileSync(join(runDir, "events.jsonl"), stdout);
	writeFileSync(join(runDir, "pi-stderr.log"), stderr.slice(0, 200000));
	log(`${arm}: pi exited rc=${rc} after ${elapsedMin}m${timedOut ? " (TIMEOUT)" : ""}`);

	// Commit everything (official instruction tells the agent to commit; this
	// is the safety net), then produce model.patch exactly like the official
	// collect step.
	await dockerIn(cname, ["git", "config", "--global", "--add", "safe.directory", "/app"]);
	await dockerIn(cname, ["bash", "-lc", "cd /app && git add -A && git diff --cached --quiet || git commit -qm agent-changes || true"]);
	const diff = await dockerIn(cname, ["bash", "-lc", `cd /app && git diff --binary ${task.baseCommit} HEAD`]);
	writeFileSync(join(runDir, "model.patch"), diff.stdout);
	await docker(["cp", `${cname}:/pi-home/request-dump.jsonl`, join(runDir, "request-dump.jsonl")]).catch(() => {});
	await docker(["rm", "-f", cname]).catch(() => {});
	log(`${arm}: patch ${(diff.stdout.length / 1024).toFixed(1)} KiB`);

	return verify(arm, runDir);
}

async function verify(arm, runDir) {
	const patchPath = join(runDir, "model.patch").replace(/\\/g, "/");
	if (!existsSync(patchPath)) {
		log(`${arm}: no model.patch; reward=crash`);
		return { arm, reward: -1, reason: "no-patch" };
	}
	const cname = `dsw-verify-${TASK}-${arm}`;
	await docker(["rm", "-f", cname]).catch(() => {});
	try {
		await docker([
			"run",
			"-d",
			"--name",
			cname,
			"--cpus=2",
			"--memory=8g",
			"--network",
			"none",
			"-v",
			`${patchPath}:/logs/artifacts/model.patch`,
			verifyTag,
			"sleep",
			"infinity",
		]);
		await dockerIn(cname, ["mkdir", "-p", "/logs/verifier"]);
		const res = await dockerIn(cname, ["bash", "/tests/test.sh"]).catch((e) => e);
		const out = (res.stdout || "") + (res.stderr || "");
		writeFileSync(join(runDir, "verify.log"), out);
		await docker(["cp", `${cname}:/logs/verifier/reward.json`, join(runDir, "reward.json")]).catch(() => {});
	} finally {
		await docker(["rm", "-f", cname]).catch(() => {});
	}
	let reward = null;
	let summary = null;
	const rf = join(runDir, "reward.json");
	if (existsSync(rf)) {
		reward = JSON.parse(readFileSync(rf, "utf8"));
		summary = { reward: reward.reward, f2p: `${reward.f2p_passed}/${reward.f2p_total}`, partial: reward.partial, apply_failed: reward.apply_failed };
	}
	log(`${arm}: verify -> ${JSON.stringify(summary)}`);
	appendSummary({ task: TASK, arm, ...summary });
	return reward;
}

const SUMMARY = join(RUNS_DIR, `summary-${TAG}.jsonl`);
function appendSummary(line) {
	mkdirSync(RUNS_DIR, { recursive: true });
	appendFileSync(SUMMARY, JSON.stringify(line) + "\n");
}

if (!VERIFY_ONLY) await buildImages();
for (const arm of ARMS) await runArm(arm);
// Disk hygiene: each task's env/agent/verify images are ~1-4GB and unique
// to the task. The run dir keeps every artifact we need, so drop the
// images to keep peak Docker usage bounded (~8 concurrent tasks) — the
// Windows Docker VHDX lives on the small C: drive.
if (!VERIFY_ONLY) {
	for (const img of [imageTag, verifyTag, task.image]) {
		await docker(["rmi", "-f", img]).catch(() => {});
	}
	log("cleaned task images");
}
console.log(`done. summary: ${SUMMARY}`);
