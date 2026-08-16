import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { modelMatchesPatterns, type ModelDescriptor } from "./model.ts";

/**
 * The v0.2.x V4 Flash weak-routing + mode-boost profile was removed in
 * v0.3.0: a controlled DeepSWE A/B (pi + opencode-go flash, 10 tasks x
 * enabled/disabled, official verifier) found no score lift (4/11 vs 5/10
 * solved, p=1.0), and the upstream dsh-routing-suite's own P21 data shows
 * near-field guidance is negative on related-task chains — the shape of
 * real SWE sessions. Since v0.3.1 flash matches the Pro patterns by
 * default instead: the anchored-standard bootstrap measured 9/10 vs 6/10
 * on the same subset. Models outside the patterns stay untouched.
 */
export type AdapterProfile = "inactive" | "pro";

function contextModel(ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">): ModelDescriptor | undefined {
	if (!("model" in ctx)) return undefined;
	return ctx.model ?? undefined;
}

export function resolveAdapterProfile(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: DshMinimalConfig,
): AdapterProfile {
	if (!config.enabled) return "inactive";
	const model = contextModel(ctx);
	if (modelMatchesPatterns(model, config.modelPatterns)) return "pro";
	if (config.useOnAllModels) return "pro";
	return "inactive";
}

export function shouldUseAdapter(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: DshMinimalConfig,
): boolean {
	return resolveAdapterProfile(ctx, config) !== "inactive";
}
