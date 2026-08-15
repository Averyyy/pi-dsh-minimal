import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	DEFAULT_BASH_TIMEOUT_MS,
	DEFAULT_MAX_OUTPUT_CHARS,
	SHELL_RESET_MESSAGE,
	TRUNCATED_MESSAGE,
} from "../dsh/official.ts";

export interface PersistentBashExecOptions {
	timeoutMs?: number;
	maxOutputChars?: number;
	signal?: AbortSignal;
}

interface CommandMarkers {
	start: string;
	end: string;
}

function quoteForBash(value: string): string {
	return `$'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\r", "\\r").replaceAll("\n", "\\n")}'`;
}

function markers(): CommandMarkers {
	const nonce = randomUUID();
	return {
		start: `__DSH_PERSISTENT_BASH_START_${nonce}__`,
		end: `__DSH_PERSISTENT_BASH_END_${nonce}:`,
	};
}

function wrapCommand(command: string, marker: CommandMarkers): string {
	return `printf '%s\\n' ${quoteForBash(marker.start)}; eval -- ${quoteForBash(command)}; __dsh_persistent_bash_status=$?; printf '%s%s\\n' ${quoteForBash(marker.end)} "$__dsh_persistent_bash_status"`;
}

function maybeTruncate(content: string, maxOutputChars: number, incomplete = false): string {
	if (content.length <= maxOutputChars && !incomplete) return content;
	return content.length <= maxOutputChars ? content + TRUNCATED_MESSAGE : content.slice(0, maxOutputChars) + TRUNCATED_MESSAGE;
}

function appendStatusMarker(content: string, marker: string | undefined): string {
	if (marker === undefined) return content;
	return content.length === 0 ? marker : `${content}\n${marker}`;
}

function resolveBashExecutable(): string {
	const shell = process.env.SHELL ?? "";
	if (/(^|[\\/])bash(\.exe)?$/i.test(shell)) return shell;
	return process.platform === "win32" ? "bash.exe" : "bash";
}

function parseCaptured(buffer: string, marker: CommandMarkers): { text: string; exitCode: number } | undefined {
	const end = buffer.lastIndexOf(marker.end);
	if (end < 0) return undefined;
	const statusMatch = /^(\d+)\r?\n?/.exec(buffer.slice(end + marker.end.length));
	if (statusMatch === null || statusMatch[1] === undefined) return undefined;
	const startMarker = buffer.lastIndexOf(marker.start, end);
	const start = startMarker < 0 ? 0 : startMarker + marker.start.length;
	let text = buffer.slice(start, end).replace(/^\r?\n/, "");
	if (text.endsWith("\r\n")) text = text.slice(0, -2);
	else if (text.endsWith("\n")) text = text.slice(0, -1);
	return { text, exitCode: Number(statusMatch[1]) };
}

export class PersistentBashSession {
	private proc: ChildProcessWithoutNullStreams | undefined;
	private buffer = "";
	private queue: Promise<unknown> = Promise.resolve();
	private cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	setCwd(cwd: string): void {
		if (cwd === this.cwd) return;
		this.cwd = cwd;
		void this.reset("workspace changed");
	}

	async reset(_reason = "reset"): Promise<void> {
		const proc = this.proc;
		this.proc = undefined;
		this.buffer = "";
		if (!proc) return;
		await new Promise<void>((resolve) => {
			const done = () => resolve();
			proc.once("exit", done);
			proc.kill("SIGTERM");
			setTimeout(() => {
				if (!proc.killed) proc.kill("SIGKILL");
				done();
			}, 500).unref();
		});
	}

	async exec(command: string, options: PersistentBashExecOptions = {}): Promise<string> {
		const run = this.queue.then(() => this.execUnlocked(command, options), () => this.execUnlocked(command, options));
		this.queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	private async execUnlocked(command: string, options: PersistentBashExecOptions): Promise<string> {
		if (command.trim().length === 0) throw new Error("command must be a non-empty string");
		const timeoutMs = options.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
		const maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
		const signal = options.signal;
		if (signal?.aborted) throw new Error("bash aborted");

		const proc = await this.ensure();
		const marker = markers();
		const wrapped = `${wrapCommand(command, marker)}\n`;
		this.buffer = "";

		return await new Promise<string>((resolve, reject) => {
			let settled = false;
			const onData = (chunk: Buffer) => {
				this.buffer += chunk.toString("utf8");
				const captured = parseCaptured(this.buffer, marker);
				if (captured === undefined) return;
				finish(() => resolve(renderCaptured(captured.text, captured.exitCode, maxOutputChars)));
			};
			const onExit = (code: number | null, killedSignal: NodeJS.Signals | null) => {
				this.proc = undefined;
				const markerText =
					killedSignal !== null
						? `[shell killed by signal: ${killedSignal}]`
						: code !== null
							? `[shell exited: code ${code}]`
							: "[shell exited]";
				finish(() =>
					resolve(
						appendStatusMarker(maybeTruncate(this.buffer, maxOutputChars), markerText) + `\n${SHELL_RESET_MESSAGE}`,
					),
				);
			};
			const onAbort = () => {
				finish(async () => {
					await this.reset("aborted");
					reject(new Error("bash aborted"));
				});
			};
			const timeout = setTimeout(() => {
				finish(async () => {
					const partial = maybeTruncate(partialText(this.buffer, marker), maxOutputChars);
					await this.reset("timeout");
					resolve(
						[
							`Your command timed out after ${Math.round(timeoutMs / 1000)} seconds or experienced an OOM error. Below is partial output:`,
							partial,
							SHELL_RESET_MESSAGE,
						].join("\n"),
					);
				});
			}, timeoutMs);

			const finish = (action: () => void | Promise<void>) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				proc.stdout.off("data", onData);
				proc.stderr.off("data", onData);
				proc.off("exit", onExit);
				signal?.removeEventListener("abort", onAbort);
				void Promise.resolve(action()).catch(reject);
			};

			proc.stdout.on("data", onData);
			proc.stderr.on("data", onData);
			proc.once("exit", onExit);
			if (signal) {
				if (signal.aborted) {
					onAbort();
					return;
				}
				signal.addEventListener("abort", onAbort, { once: true });
			}
			try {
				proc.stdin.write(wrapped);
			} catch (error) {
				finish(async () => {
					await this.reset("write failed");
					reject(error instanceof Error ? error : new Error(String(error)));
				});
			}
		});
	}

	private async ensure(): Promise<ChildProcessWithoutNullStreams> {
		if (this.proc && this.proc.exitCode === null && !this.proc.killed) return this.proc;
		const executable = resolveBashExecutable();
		const proc = spawn(executable, ["--noprofile", "--norc"], {
			cwd: this.cwd,
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		}) as ChildProcessWithoutNullStreams;
		if (proc.stdin === null || proc.stdout === null || proc.stderr === null) {
			proc.kill();
			throw new Error("persistent bash did not expose stdio pipes");
		}
		proc.stdin.setDefaultEncoding("utf8");
		proc.on("error", () => {
			if (this.proc === proc) this.proc = undefined;
		});
		this.proc = proc;
		this.buffer = "";
		return proc;
	}
}

function renderCaptured(text: string, exitCode: number, maxOutputChars: number): string {
	const rendered = maybeTruncate(text, maxOutputChars);
	return exitCode === 0 ? rendered : appendStatusMarker(rendered, `[exit code: ${exitCode}]`);
}

function partialText(buffer: string, marker: CommandMarkers): string {
	const startMarker = buffer.lastIndexOf(marker.start);
	if (startMarker < 0) return buffer;
	return buffer.slice(startMarker + marker.start.length).replace(/^\r?\n/, "");
}

export function createPersistentBashSession(cwd: string): PersistentBashSession {
	return new PersistentBashSession(cwd);
}
