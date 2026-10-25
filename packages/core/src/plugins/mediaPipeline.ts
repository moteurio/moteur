import type {
    MediaGenerator,
    MediaGeneratorResult,
    MediaTransform,
    MediaTransformContext,
    MediaVariantPreset
} from '@moteurio/plugin-sdk';

type Tagged<T> = T & { pluginId?: string };

const presets = new Map<string, Tagged<MediaVariantPreset>>();
const transforms = new Map<string, Tagged<MediaTransform>>();
const generators = new Map<string, Tagged<MediaGenerator>>();

export function registerMediaVariantPreset(preset: MediaVariantPreset, pluginId?: string): void {
    if (!preset?.id) return;
    presets.set(preset.id, { ...preset, pluginId });
}

export function registerMediaTransform(transform: MediaTransform, pluginId?: string): void {
    if (!transform?.id) return;
    transforms.set(transform.id, { ...transform, pluginId });
}

export function registerMediaGenerator(generator: MediaGenerator, pluginId?: string): void {
    if (!generator?.id) return;
    generators.set(generator.id, { ...generator, pluginId });
}

export function listMediaVariantPresets(): Tagged<MediaVariantPreset>[] {
    return [...presets.values()];
}

export function listMediaTransforms(): Tagged<MediaTransform>[] {
    return [...transforms.values()];
}

export function listMediaGenerators(): Tagged<MediaGenerator>[] {
    return [...generators.values()];
}

function matchesMime(transform: MediaTransform, mimeType: string): boolean {
    const allowed = transform.mimeTypes ?? ['image/'];
    return allowed.some(prefix => mimeType === prefix || mimeType.startsWith(prefix));
}

export async function applyMediaTransforms(
    bytes: Uint8Array,
    ctx: MediaTransformContext,
    stage: 'source' | 'variant'
): Promise<Uint8Array> {
    let out = bytes;
    for (const transform of transforms.values()) {
        if (stage === 'variant' ? !transform.perVariant : transform.perVariant) continue;
        if (!matchesMime(transform, ctx.mimeType)) continue;
        try {
            out = await transform.apply(out, ctx);
        } catch (err) {
            console.warn(
                `[media] Transform "${transform.id}" failed:`,
                err instanceof Error ? err.message : err
            );
        }
    }
    return out;
}

export async function runMediaGenerator(
    id: string,
    input: { projectId: string; params: Record<string, unknown> }
): Promise<MediaGeneratorResult> {
    const generator = generators.get(id);
    if (!generator)
        throw Object.assign(new Error(`Unknown media generator "${id}"`), { status: 404 });
    return generator.generate(input);
}

export function resetMediaPipeline(): void {
    presets.clear();
    transforms.clear();
    generators.clear();
}
