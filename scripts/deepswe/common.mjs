/**
 * Shared helpers for the local DeepSWE A/B harness (pi + opencode-go flash,
 * pi-dsh-minimal enabled vs disabled). Not part of the published package.
 */
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readDumpSurfaces } from "../live-harness.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const TASKS_DIR = join(ROOT, "ref", "deep-swe", "tasks");
export const RUNS_DIR = join(ROOT, "runs", "deepswe");
export const AGENT_HOME = join(homedir(), ".pi", "agent");

export function sh(cmd, args, opts = {}) {
	const { input, ...execOpts } = opts;
	return new Promise((resolve, reject) => {
		const child = execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, ...execOpts }, (err, stdout, stderr) => {
			if (err) {
				err.stderr = stderr?.toString();
				err.stdout = stdout?.toString();
				reject(err);
			} else {
				resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
			}
		});
		if (input !== undefined && child.stdin) {
			child.stdin.on("error", () => {});
			child.stdin.end(input);
		}
	});
}

export const docker = (args, opts) => sh("docker", args, opts);
// NOTE: any exec options (-e, -w, ...) must be placed before `name` by callers.
export const dockerIn = (name, args, opts) => docker(["exec", name, ...args], opts);

export function readTask(taskId) {
	const dir = join(TASKS_DIR, taskId);
	const toml = readFileSync(join(dir, "task.toml"), "utf8");
	const config = JSON.parse(readFileSync(join(dir, "tests", "config.json"), "utf8"));
	const image = toml.match(/docker_image\s*=\s*"([^"]+)"/)?.[1];
	const instruction = readFileSync(join(dir, "instruction.md"), "utf8");
	if (!image) throw new Error(`no docker_image in ${taskId}`);
	return { taskId, dir, image, baseCommit: config.base_commit, config, instruction };
}

export function writeAgentHome(runDir, { enabled, useOnAllModels = false }) {
	const home = join(runDir, "pi-home");
	mkdirSync(join(home, "sessions"), { recursive: true });
	// stripped auth: opencode-go key only, never printed
	const auth = JSON.parse(readFileSync(join(AGENT_HOME, "auth.json"), "utf8"));
	writeFileSync(
		join(home, "auth.json"),
		JSON.stringify({ "opencode-go": auth["opencode-go"] }, null, 2),
	);
	for (const f of ["models-store.json"]) {
		const src = join(AGENT_HOME, f);
		if (existsSync(src)) copyFileSync(src, join(home, f));
	}
	writeFileSync(
		join(home, "settings.json"),
		JSON.stringify(
			{
				packages: ["/plugin"],
				defaultProvider: "opencode-go",
				defaultModel: process.env.PI_DSH_MODEL?.split(":")[0]?.split("/")[1] || "deepseek-v4-flash",
				defaultThinkingLevel: "max",
				defaultProjectTrust: "always",
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(home, "pi-dsh-minimal.json"),
		JSON.stringify(
			{
				enabled,
				statusLine: false,
				useOnAllModels,
				// v0.3.1 shipped defaults: flash rides the Pro anchored-standard
				// bootstrap. Keep in sync with DEFAULT_MODEL_PATTERNS.
				modelPatterns: ["deepseek-v4-pro", "deepseek-v4-flash"],
				promoteOn: "either",
			},
			null,
			2,
		),
	);
	return home;
}

export function mountArgs(hostDir, containerDir, ro = false) {
	// execFile bypasses MSYS path conversion; plain forward-slash host paths
	// are what Docker Desktop on Windows expects.
	const host = hostDir.replace(/\\/g, "/");
	return ["-v", `${host}:${containerDir}${ro ? ":ro" : ""}`];
}

export { readDumpSurfaces };
