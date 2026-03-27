import type { OpenAPIV3 } from 'openapi-types';

const validMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
//type HttpMethod = typeof validMethods[number];

export function mergePathSpecs(
    ...pathObjects: Record<string, OpenAPIV3.PathItemObject>[]
): Record<string, OpenAPIV3.PathItemObject> {
    const merged: Record<string, OpenAPIV3.PathItemObject> = {};

    for (const paths of pathObjects) {
        for (const [path, item] of Object.entries(paths)) {
            if (!merged[path]) {
                merged[path] = {};
            }

            for (const method of validMethods) {
                if (item[method]) {
                    merged[path][method] = item[method];
                }
            }
        }
    }

    return merged;
}
