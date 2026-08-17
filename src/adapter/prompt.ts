import { getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { MINIMAL_PROMPT } from "../dsh/official.ts";

/** First paragraph of Pi's default system prompt. Restoring this breaks the Pro anchor. */
export const PI_IDENTITY =
	"You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";

export interface PromptContextFile {
	path: string;
	content: string;
}

export interface PromptSkill {
	name: string;
	description: string;
	filePath: string;
	disableModelInvocation?: boolean;
}

export interface PromptResources {
	contextFiles?: readonly PromptContextFile[];
	skills?: readonly PromptSkill[];
	appendSystemPrompt?: string;
	selectedTools?: readonly string[];
	toolSnippets?: Readonly<Record<string, string>>;
	promptGuidelines?: readonly string[];
	cwd?: string;
}

export interface ComposeAnchoredPromptOptions extends PromptResources {
	/**
	 * After promotion: reanchor an existing assembled prompt (Pi + other
	 * extensions) and fill in workspace / tools-guide / docs if missing.
	 * Request #1 stays the official one-liner.
	 */
	includeWorkspace?: boolean;
	/** Pi's (or another extension's) already-assembled system prompt. */
	assembledPrompt?: string;
}

export function emptyPromptResources(): PromptResources {
	return {};
}

export function promptResourcesFrom(options: {
	contextFiles?: readonly PromptContextFile[];
	skills?: readonly PromptSkill[];
	appendSystemPrompt?: string;
	selectedTools?: readonly string[];
	toolSnippets?: Readonly<Record<string, string>>;
	promptGuidelines?: readonly string[];
	cwd?: string;
} | undefined): PromptResources {
	if (!options) return emptyPromptResources();
	return {
		contextFiles: options.contextFiles,
		skills: options.skills,
		appendSystemPrompt: options.appendSystemPrompt,
		selectedTools: options.selectedTools,
		toolSnippets: options.toolSnippets,
		promptGuidelines: options.promptGuidelines,
		cwd: options.cwd,
	};
}

export function minimalSystemPrompt(): string {
	return MINIMAL_PROMPT;
}

export function isMinimalSystemPrompt(value: string | undefined): boolean {
	return value?.trim() === MINIMAL_PROMPT;
}

export function isAnchoredSystemPrompt(value: string | undefined): boolean {
	return Boolean(value?.startsWith(MINIMAL_PROMPT));
}

/**
 * Keep the official first sentence. Drop Pi's identity paragraph when present.
 * Any later text — tools-guide, docs, AGENTS.md, skills, hermes/hypa appends —
 * stays.
 */
export function reanchorPersona(system: string): string {
	const text = system.replace(/^\uFEFF?[\s\n]*/, "");
	if (text.startsWith(MINIMAL_PROMPT)) return text;
	if (text.startsWith(PI_IDENTITY)) return MINIMAL_PROMPT + text.slice(PI_IDENTITY.length);
	if (text.length === 0) return MINIMAL_PROMPT;
	return `${MINIMAL_PROMPT}\n\n${text}`;
}

/**
 * Official persona first. Request #1 is that sentence only.
 * After promotion, reanchor the assembled Pi/extension prompt and add
 * workspace + tools-guide + docs only when they are not already there.
 */
export function composeAnchoredPrompt(options: ComposeAnchoredPromptOptions = {}): string {
	if (!options.includeWorkspace) return MINIMAL_PROMPT;
	const assembled = options.assembledPrompt?.trim();
	let prompt = reanchorPersona(assembled && assembled.length > 0 ? assembled : MINIMAL_PROMPT);
	return ensurePromotedSurface(prompt, options);
}

/** Add Pi workspace / tools-guide / docs when a reanchored prompt lacks them. */
export function ensurePromotedSurface(system: string, resources: PromptResources = {}): string {
	let text = system;
	if (!/\nAvailable tools:/.test(`\n${text}`) && !text.includes("Available tools:")) {
		text += formatToolsGuide(resources);
	}
	if (!text.includes("Pi documentation")) {
		text += formatPiDocs();
	}
	const append = resources.appendSystemPrompt?.trim();
	if (append && !text.includes(append)) text += `\n\n${append}`;
	if (!text.includes("<project_context>")) {
		text += formatProjectContext(resources.contextFiles ?? []);
	}
	if (!text.includes("<available_skills>")) {
		text += formatSkillsSection(resources.skills ?? []);
	}
	if (resources.cwd && !/Current working directory:/.test(text)) {
		text += `\nCurrent working directory: ${resources.cwd.replace(/\\/g, "/")}`;
	}
	return text;
}

export function formatToolsGuide(resources: PromptResources): string {
	const tools = [...(resources.selectedTools ?? [])];
	const snippets = resources.toolSnippets ?? {};
	const visible = tools.filter((name) => snippets[name]);
	const toolsList =
		visible.length > 0 ? visible.map((name) => `- ${name}: ${snippets[name]}`).join("\n") : "(none)";
	const guidelinesList: string[] = [];
	const seen = new Set<string>();
	const add = (guideline: string) => {
		if (seen.has(guideline)) return;
		seen.add(guideline);
		guidelinesList.push(guideline);
	};
	const hasBash = tools.includes("bash");
	if (hasBash && !tools.includes("grep") && !tools.includes("find") && !tools.includes("ls")) {
		add("Use bash for file operations like ls, rg, find");
	}
	for (const guideline of resources.promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) add(normalized);
	}
	add("Be concise in your responses");
	add("Show file paths clearly when working with files");
	const guidelines = guidelinesList.map((item) => `- ${item}`).join("\n");
	return `

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}
`;
}

export function formatPiDocs(): string {
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();
	return `
Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${readmePath}
- Additional docs: ${docsPath}
- Examples: ${examplesPath} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
}

/** Match Pi `buildSystemPrompt` project_context markup. */
export function formatProjectContext(files: readonly PromptContextFile[]): string {
	if (files.length === 0) return "";
	let section = "\n\n<project_context>\n\n";
	section += "Project-specific instructions and guidelines:\n\n";
	for (const file of files) {
		section += `<project_instructions path="${file.path}">\n${file.content}\n</project_instructions>\n\n`;
	}
	section += "</project_context>\n";
	return section;
}

/**
 * Match Pi `formatSkillsForPrompt` (agentskills.io XML). Copied so tests do
 * not need a full `Skill` object and the wording stays stable if Pi adds fields.
 */
export function formatSkillsSection(skills: readonly PromptSkill[]): string {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";
	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];
	for (const skill of visible) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}
	lines.push("</available_skills>");
	return lines.join("\n");
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
