import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface ModelDescriptor {
	provider?: string;
	id?: string;
	name?: string;
}

/** Collapse spaces, dashes, underscores, slashes, and dots so id/name variants match. */
export function normalizeModelToken(value: string): string {
	return value.toLowerCase().replace(/[\s_\-./]+/g, "");
}

export function modelHaystack(model: ModelDescriptor | null | undefined): string {
	if (!model) return "";
	return normalizeModelToken([model.provider, model.id, model.name].filter(Boolean).join(" "));
}

export function modelMatchesPatterns(model: ModelDescriptor | null | undefined, patterns: readonly string[]): boolean {
	if (!model || patterns.length === 0) return false;
	const haystack = modelHaystack(model);
	if (!haystack) return false;
	return patterns.some((pattern) => {
		const needle = normalizeModelToken(pattern);
		return needle.length > 0 && haystack.includes(needle);
	});
}

export function isDeepSeekV4ProModel(model: ModelDescriptor | null | undefined): boolean {
	return modelMatchesPatterns(model, ["deepseek-v4-pro"]);
}

export function modelIdHint(model: ModelDescriptor | null | undefined): string {
	return [model?.id, model?.name].filter(Boolean).join(" ");
}

export function describeModel(model: ModelDescriptor | null | undefined): string {
	if (!model) return "(no model)";
	const provider = model.provider?.trim();
	const id = model.id?.trim();
	const name = model.name?.trim();
	if (provider && id) return name && name !== id ? `${provider}/${id} (${name})` : `${provider}/${id}`;
	return id || name || provider || "(no model)";
}

export function contextModel(ctx: Pick<ExtensionContext, "model">): ModelDescriptor | undefined {
	const model = ctx.model;
	if (!model) return undefined;
	return {
		provider: typeof model.provider === "string" ? model.provider : undefined,
		id: typeof model.id === "string" ? model.id : undefined,
		name: typeof model.name === "string" ? model.name : undefined,
	};
}
