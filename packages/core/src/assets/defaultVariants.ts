import type { VariantDefinition } from '@moteurio/types/VariantDefinition.js';

export const DEFAULT_IMAGE_VARIANTS: VariantDefinition[] = [
    {
        key: 'thumb',
        label: 'Thumbnail',
        width: 400,
        height: 400,
        fit: 'cover',
        format: 'webp',
        quality: 85
    },
    { key: 'medium', label: 'Medium', width: 1200, fit: 'inside', format: 'webp', quality: 85 },
    { key: 'large', label: 'Large', width: 2400, fit: 'inside', format: 'webp', quality: 85 }
];

export function getVariantDefinitions(project: {
    assetConfig?: { variants?: VariantDefinition[] };
}): VariantDefinition[] {
    const custom = project.assetConfig?.variants;
    if (!custom || custom.length === 0) return [...DEFAULT_IMAGE_VARIANTS];
    return [...custom];
}
