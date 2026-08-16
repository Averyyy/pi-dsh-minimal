import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
export const AGENT_HOME = process.env.PI_CODING_AGENT_DIR_SRC || join(homedir(), ".pi", "agent");

export function copyIfExists(from, to) {
	if (!existsSync(from)) return false;
	mkdirSync(dirname(to), { recursive: true });
	copyFileSync(from, to);
	return true;
}

export function extractThinking(events) {
	const texts = [];
	for (const event of events) {
		if (event?.type === "message_end" && event.message?.role === "assistant" && Array.isArray(event.message.content)) {
			for (const block of event.message.content) {
				if (block?.type === "thinking" && typeof block.thinking === "string") texts.push(block.thinking);
			}
		}
	}
	return texts.join("\n\n");
}

export function firstLine(text) {
	return (
		text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0) ?? ""
	);
}

export function parseEvents(stdout) {
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

export function readDumpSurfaces(path) {
	if (!existsSync(path)) return [];
	const raw = readFileSync(path, "utf8").trim();
	if (!raw) return [];
	if (raw.startsWith("{") && raw.includes("\n{")) {
		return raw
			.split(/\r?\n/)
			.filter(Boolean)
			.flatMap((line) => {
				try {
					return [JSON.parse(line)];
				} catch {
					return [];
				}
			});
	}
	try {
		return [JSON.parse(raw)];
	} catch {
		return raw
			.split(/\r?\n/)
			.filter(Boolean)
			.flatMap((line) => {
				try {
					return [JSON.parse(line)];
				} catch {
					return [];
				}
			});
	}
}

export function runPi(env, args) {
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

export function createIsolatedAgent(options = {}) {
	const isolated = mkdtempSync(join(tmpdir(), options.prefix || "pi-dsh-minimal-live-"));
	const dump = join(isolated, "request.jsonl");
	const work = join(isolated, "work");
	const sessions = join(isolated, "sessions");
	mkdirSync(work);
	mkdirSync(sessions);
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
				defaultModel: options.defaultModel || "deepseek-v4-pro",
				defaultThinkingLevel: "max",
				defaultProjectTrust: "always",
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(isolated, "pi-dsh-minimal.json"),
		`${JSON.stringify(
			{
				enabled: true,
				statusLine: false,
				useOnAllModels: false,
				modelPatterns: ["deepseek-v4-pro"],
				flashPatterns: ["deepseek-v4-flash"],
				promoteOn: "either",
				flashRouting: "weak",
			},
			null,
			2,
		)}\n`,
	);
	return {
		isolated,
		dump,
		work,
		sessions,
		env: {
			PI_CODING_AGENT_DIR: isolated,
			PI_DSH_MINIMAL_DUMP: dump,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
		},
	};
}
