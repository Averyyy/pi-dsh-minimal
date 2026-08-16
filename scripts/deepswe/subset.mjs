#!/usr/bin/env node
/**
 * Run the DeepSWE A/B subset: N tasks x arms, tasks in flight limited by
 * PI_DSH_SUBSET_PARALLEL (default 3). Skips (task, arm) pairs already
 * present in the tag's summary file, so it resumes/extends prior runs.
 *
 * Env:
 *   PI_DSH_TAG           summary/run-dir tag (default "flash")
 *   PI_DSH_ARMS          comma list, default "plugin,baseline"; use
 *                        "plugin" for extension-only continuation runs
 *   PI_DSH_ALL=1         run ALL 113 tasks (ignores the built-in 10-task
 *                        list; already-done pairs are still skipped)
 *   PI_DSH_SUBSET_PARALLEL concurrency (default 3)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { RUNS_DIR, ROOT, TASKS_DIR } from "./common.mjs";

const TAG = process.env.PI_DSH_TAG || "flash";
const ARMS = (process.env.PI_DSH_ARMS || "plugin,baseline").split(",").map((s) => s.trim());
const PARALLEL = Number(process.env.PI_DSH_SUBSET_PARALLEL || 3);

const TEN_TASKS = [
	"abs-stepped-slices",
	"etree-xml-diff-patch",
	"mashumaro-flattened-dataclass-fields",
	"tomlkit-toml-table-converters",
	"bandit-structured-nosec-directives",
	"ts-pattern-match-each",
	"true-myth-iterable-collection-combinators",
	"sql-formatter-bigquery-pipe-formatting",
	"testem-bail-on-test-failure",
	"fd-deterministic-multi-key-sorting",
];

const TASKS = process.env.PI_DSH_ALL
	? readdirSync(TASKS_DIR)
			.filter((d) => existsSync(join(TASKS_DIR, d, "task.toml")))
			.sort()
	: TEN_TASKS;

function done() {
	const summaryPath = join(RUNS_DIR, `summary-${TAG}.jsonl`);
	if (!existsSync(summaryPath)) return new Set();
	return new Set(
		readFileSync(summaryPath, "utf8")
			.trim()
			.split(/\r?\n/)
			.filter(Boolean)
			.map((l) => {
				const j = JSON.parse(l);
				return `${j.task}|${j.arm}`;
			}),
	);
}

function runTask(task) {
	return new Promise((resolve) => {
		const p = spawn(
			process.execPath,
			["scripts/deepswe/ab-run.mjs", "--task", task, "--arm", ARMS.join(",")],
			{ cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
		);
		p.stdout.on("data", (c) => process.stdout.write(`[${task}] ${c}`));
		p.stderr.on("data", (c) => process.stderr.write(`[${task}] ${c}`));
		p.on("close", (code) => {
			console.log(`[${task}] finished rc=${code}`);
			resolve();
		});
	});
}

const finished = done();
const queue = TASKS.filter((t) => {
	for (const arm of ARMS) if (!finished.has(`${t}|${arm}`)) return true;
	return false;
});
console.log(`tag=${TAG} arms=${ARMS.join("+")} queued ${queue.length}/${TASKS.length}: ${queue.join(", ")}`);
const workers = Array.from({ length: PARALLEL }, () => {
	const next = () => {
		const t = queue.shift();
		return t ? runTask(t).then(next) : Promise.resolve();
	};
	return next();
});
await Promise.all(workers);
console.log("subset complete");
