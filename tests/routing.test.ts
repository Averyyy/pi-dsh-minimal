import test from "node:test";
import assert from "node:assert/strict";
import {
	classifyTask,
	guideFor,
	GUIDE_BASE,
	GUIDE_BOOST,
	GUIDE_CLOSURE,
	GUIDE_COMMIT,
	GUIDE_DEEP,
	isChatTask,
	isComplexTask,
	isFlashModel,
	personaFor,
	routingMode,
	WEAK_FLASH,
	WEAK_PRO,
} from "../src/routing/core.ts";
import { injectFlashGuidance } from "../src/adapter/guidance.ts";
import { extractTextContent } from "../src/routing/core.ts";

function extractUserContent(message: { role: string; content?: unknown }): string {
	return extractTextContent(message.content);
}

test("classifyTask splits build vs fix and falls back to weak", () => {
	assert.equal(classifyTask("build a mario game from scratch"), 1);
	assert.equal(classifyTask("fix the crash in main.py"), 0);
	assert.equal(classifyTask("what do you think?"), "weak");
});

test("isChatTask stands down on greetings and short non-tasks", () => {
	assert.equal(isChatTask("你好"), true);
	assert.equal(isChatTask("hello"), true);
	assert.equal(isChatTask("ok"), true);
	assert.equal(isChatTask("fix the crash in main.py"), false);
	assert.equal(isChatTask("please inspect src/index.ts and explain the adapter"), false);
});

test("Flash weak persona is the measured mode-boost text", () => {
	assert.equal(personaFor("weak", "deepseek-v4-flash"), WEAK_FLASH);
	assert.equal(personaFor("weak", "deepseek-v4-pro"), WEAK_PRO);
	assert.match(WEAK_FLASH, /Think deeply first, then produce/);
	assert.equal(isFlashModel("opencode-go/deepseek-v4-flash:max"), true);
});

test("guideFor is depth-adaptive and boosts from round 3", () => {
	const simple1 = guideFor(1, "print hello", "deepseek-v4-flash");
	assert.equal(simple1, GUIDE_BASE + GUIDE_COMMIT);
	const simple3 = guideFor(3, "print hello", "deepseek-v4-flash");
	assert.equal(simple3, GUIDE_BOOST + GUIDE_COMMIT);
	assert.equal(isComplexTask("please do a comprehensive architecture review of this system"), true);
	const deepFlash = guideFor(1, "please do a comprehensive architecture review of this system", "deepseek-v4-flash");
	assert.equal(deepFlash, GUIDE_BASE + GUIDE_DEEP);
	assert.equal(deepFlash.includes(GUIDE_CLOSURE), false);
	const deepPro = guideFor(1, "please do a comprehensive architecture review of this system", "deepseek-v4-pro");
	assert.equal(deepPro, GUIDE_BASE + GUIDE_DEEP + GUIDE_CLOSURE);
});

test("routingMode weak stays weak; auto classifies", () => {
	assert.equal(routingMode("weak", "build a website"), "weak");
	assert.equal(routingMode("auto", "build a website"), 1);
	assert.equal(routingMode("spec", "build a website"), 0);
});

test("injectFlashGuidance appends near-field text once", () => {
	const messages = [
		{ role: "user" as const, content: "fix the crash", timestamp: 1 },
	];
	const first = injectFlashGuidance(messages, "deepseek-v4-flash");
	assert.ok(first);
	const firstUser = first[0];
	assert.ok(firstUser && firstUser.role === "user");
	assert.match(extractUserContent(firstUser), /Router: classify this task/);
	const second = injectFlashGuidance(first, "deepseek-v4-flash");
	assert.equal(second, undefined);
});
