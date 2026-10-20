import type { OpenAPIV3 } from 'openapi-types';

const TRUE = new Set(['1', 'true', 'yes']);

/** A boolean query flag: `?resolveUrl=true`, `=1` and `=yes` turn it on; anything else is off. */
export function queryFlag(value: unknown): boolean {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' && TRUE.has(raw.trim().toLowerCase());
}

export function flagParameter(name: string, description: string): OpenAPIV3.ParameterObject {
    return {
        name,
        in: 'query',
        required: false,
        schema: { type: 'boolean', default: false },
        description: `${description} Accepts \`true\` or \`1\`.`
    };
}

export const resolveAssetsParameter = () =>
    flagParameter('resolveAssets', 'Inline asset URLs on asset fields.');

export const resolveUrlParameter = () =>
    flagParameter('resolveUrl', 'Add `resolvedUrl` (the canonical site URL) on each entry.');
