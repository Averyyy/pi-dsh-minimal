/**
 * Flash routing + mode-boost texts.
 *
 * Port of dsh-mode-boost `lib/core.js` (measured on DeepSeek V4 Flash,
 * 2026-08-15) with the same classify / chat / guidance dispatch as
 * dsh-router-standard's weak band. Keep these strings byte-stable: the
 * published Flash lifts were measured against this wording.
 */

export const MODE_SPEC = 0;
export const MODE_MIXED = 0.3;
export const MODE_REACT = 1;
export const MODE_WEAK = "weak" as const;

export type RouterMode = typeof MODE_SPEC | typeof MODE_MIXED | typeof MODE_REACT | typeof MODE_WEAK;
export type RouterBand = "spec" | "mixed" | "react" | "weak";
export type FlashRouting = "weak" | "auto" | "spec" | "react";

export const SPEC_PERSONA = "You are a helpful software engineer assistant.";

export const MIXED_PERSONA =
	"You are a helpful software engineer assistant.\n" +
	"Work directly: prefer writing or editing code over describing plans. " +
	"Verify your changes by reading and running them.";

export const REACT_PERSONA =
	"You are a hands-on software engineer who delivers working output fast.\n" +
	"Work directly: write or edit code, then verify it by reading and running. " +
	"Keep the loop tight — produce, verify, fix — and do not build test " +
	"harnesses, scaffolding, or ceremony the user did not ask for. " +
	"Finish with a usable deliverable and a short summary.";

export const WEAK_PRO =
	"You are a helpful software engineer assistant.\n" +
	"Before acting, decide the task type (build or fix) and adopt the matching " +
	"style: build → hands-on production; fix → inspect-and-plan.";

export const WEAK_FLASH =
	"You are a helpful assistant.\n" +
	"Before acting, decide the task type (build or fix) and adopt the matching " +
	"style: build → hands-on production; fix → inspect-and-plan.\n" +
	"Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.\n" +
	"Think deeply first, then produce.";

export const GUIDE_BASE =
	"\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first.";

export const GUIDE_BOOST =
	"\n\nRouter: this is a NEW task, different from the previous ones. Classify it fresh (build or fix) and adopt the matching style — build: direct production; fix: inspect-first. Do not follow the previous task's style.";

export const GUIDE_COMMIT = " Think deeply first, then commit and act.";

export const GUIDE_DEEP =
	" Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete.";

export const GUIDE_CLOSURE = " End each reasoning block with a decision or an information need.";

export const GUIDE_MARKERS = ["Router: classify this task", "Router: this is a NEW task"] as const;

const COMPLEX_RE =
	/(重构|架构|全面|详细|设计|系统|优化|分析|survey|overview|architecture|refactor|comprehensive|detailed|design|system|optimize|analyze)/i;

const CHAT_RE =
	/^(你好|您好|hello|hi|hey|嗨|哈喽|在吗|谢谢|感谢|thanks|thank you|早上好|下午好|晚上好|嗯|好|ok|okay|yes|no|嗯嗯|好的)[!。.!？?~～]*$/i;

const REACT_RE =
	/(开发|创建|写一个|写|生成|从零|做|做一个|做个|游戏|网页|网站|构建|新项目|搭建|实现|做出|上线|落地|脚本|工具|应用|build|create|develop|generate|implement|write a|write an|build a|make a|new project)/gi;

const SPEC_RE =
	/(修复|修一下|调试|重构|维护|排查|报错|出错|崩溃|优化|审查|review|fix|debug|refactor|maintain|repair|broken|break|为什么|异常|故障|迁移|升级|兼容)/gi;

export function isComplexTask(text: string | undefined): boolean {
	return typeof text === "string" && (text.length > 120 || COMPLEX_RE.test(text));
}

export function isChatTask(text: string | undefined): boolean {
	if (typeof text !== "string") return true;
	const trimmed = text.trim();
	if (trimmed.length === 0) return true;
	if (CHAT_RE.test(trimmed)) return true;
	if (trimmed.length > 24) return false;
	return !trimmed.match(REACT_RE) && !trimmed.match(SPEC_RE);
}

export function isFlashModel(modelId: string | undefined): boolean {
	return typeof modelId === "string" && /flash/i.test(modelId);
}

export function isGuideText(text: string | undefined): boolean {
	if (!text) return false;
	return GUIDE_MARKERS.some((marker) => text.includes(marker));
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number(value) || 0));
}

export function bandOf(mode: RouterMode): "spec" | "transition" | "react" | "weak" {
	if (mode === MODE_WEAK) return "weak";
	const quantized = clamp01(mode);
	if (quantized < 0.2) return "spec";
	if (quantized < 0.5) return "transition";
	return "react";
}

export function bandFor(mode: RouterMode): RouterBand {
	const band = bandOf(mode);
	return band === "transition" ? "mixed" : band;
}

export function personaFor(mode: RouterMode, modelId?: string): string {
	switch (bandOf(mode)) {
		case "spec":
			return SPEC_PERSONA;
		case "transition":
			return MIXED_PERSONA;
		case "weak":
			return isFlashModel(modelId) ? WEAK_FLASH : WEAK_PRO;
		default:
			return REACT_PERSONA;
	}
}

export function guideFor(round: number, text: string, modelId?: string): string {
	const base = round >= 3 ? GUIDE_BOOST : GUIDE_BASE;
	if (!isComplexTask(text)) return base + GUIDE_COMMIT;
	const deep = base + GUIDE_DEEP;
	return isFlashModel(modelId) ? deep : deep + GUIDE_CLOSURE;
}

function countHits(regex: RegExp, text: string): number {
	return [...text.matchAll(regex)].length;
}

export function classifyTask(text: string): RouterMode {
	const react = countHits(REACT_RE, text);
	const spec = countHits(SPEC_RE, text);
	if (react > spec) return MODE_REACT;
	if (spec > react) return MODE_SPEC;
	return MODE_WEAK;
}

export function routingMode(flashRouting: FlashRouting, firstUserText: string | undefined): RouterMode {
	if (flashRouting === "spec") return MODE_SPEC;
	if (flashRouting === "react") return MODE_REACT;
	if (flashRouting === "auto") return classifyTask(firstUserText ?? "");
	return MODE_WEAK;
}

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
			return "";
		})
		.join(" ");
}
