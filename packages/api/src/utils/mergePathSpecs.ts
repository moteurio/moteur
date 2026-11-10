import type { OpenAPIV3 } from 'openapi-types';

const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

type Parameter = OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject;

/** Two parameters are the same when they have the same name and location. A reference is compared by its target. */
function parameterKey(param: Parameter): string {
    return '$ref' in param ? param.$ref : `${param.in}:${param.name}`;
}

/**
 * Merges path objects from several modules into one. Operations, path-level parameters, summary and
 * description are all kept, because a path's parameters apply to each of its operations and dropping
 * them leaves the operations without their path parameters.
 */
export function mergePathSpecs(
    ...pathObjects: Record<string, OpenAPIV3.PathItemObject>[]
): Record<string, OpenAPIV3.PathItemObject> {
    const merged: Record<string, OpenAPIV3.PathItemObject> = {};

    for (const paths of pathObjects) {
        for (const [path, item] of Object.entries(paths)) {
            const target = (merged[path] ??= {});

            for (const method of validMethods) {
                if (item[method]) {
                    target[method] = item[method];
                }
            }
            if (item.summary && !target.summary) target.summary = item.summary;
            if (item.description && !target.description) target.description = item.description;
            if (item.parameters?.length) {
                const known = new Set((target.parameters ?? []).map(parameterKey));
                target.parameters = [
                    ...(target.parameters ?? []),
                    ...item.parameters.filter(p => !known.has(parameterKey(p)))
                ];
            }
        }
    }

    return merged;
}
