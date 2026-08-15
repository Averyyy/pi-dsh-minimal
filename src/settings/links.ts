import { spawn } from "node:child_process";

export const GITHUB_URL = "https://github.com/Averyyy/pi-dsh-minimal";
export const CHANGELOG_URL = `${GITHUB_URL}/blob/main/CHANGELOG.md`;
export const ISSUE_URL = `${GITHUB_URL}/issues/new`;
export const HF_MODEL_CARD_URL = "https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-0813";

export function openExternalUrl(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", (error) => {
		console.warn(`[pi-dsh-minimal] Failed to open ${url}: ${error.message}`);
	});
	child.unref();
}
