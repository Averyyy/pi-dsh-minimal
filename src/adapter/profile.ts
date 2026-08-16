import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DshMinimalConfig } from "./config.ts";
import { modelMatchesPatterns, type ModelDescriptor } from "./model.ts";

export type AdapterProfile = "inactive" | "pro" | "flash";

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
	const flash = modelMatchesPatterns(model, config.flashPatterns);
	const pro = modelMatchesPatterns(model, config.modelPatterns);
	if (flash && !pro) return "flash";
	if (pro && !flash) return "pro";
	if (flash && pro) return "flash";
	if (config.useOnAllModels) return "pro";
	return "inactive";
}

export function shouldUseAdapter(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: DshMinimalConfig,
): boolean {
	return resolveAdapterProfile(ctx, config) !== "inactive";
}
