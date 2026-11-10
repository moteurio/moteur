import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';

vi.mock('@moteurio/core', () => ({
    registerCorePlugins: vi.fn(async () => {}),
    registerHostPlugins: vi.fn(async () => {}),
    listPluginCommands: vi.fn(() => []),
    pluginRegistry: {
        setContributions: vi.fn(),
        getContributions: vi.fn(() => ({})),
        has: vi.fn(() => false)
    }
}));

vi.mock('../../src/plugins/hostPlugins', () => ({
    loadHostPluginsFromEnv: vi.fn(async () => [])
}));

const methods = ['get', 'put', 'post', 'delete', 'patch'] as const;

let doc: OpenAPIV3.Document;

function operations(): Array<{
    key: string;
    path: string;
    item: OpenAPIV3.PathItemObject;
    op: OpenAPIV3.OperationObject;
}> {
    return Object.entries(doc.paths).flatMap(([path, item]) =>
        methods
            .filter(m => item?.[m])
            .map(m => ({ key: `${m.toUpperCase()} ${path}`, path, item: item!, op: item![m]! }))
    );
}

describe('merged OpenAPI document', () => {
    beforeAll(async () => {
        const { buildMergedOpenApiDocument } = await import('../../src/openapi/bootstrapApi');
        doc = await buildMergedOpenApiDocument();
    });

    it('resolves every $ref to a definition in the document', () => {
        const unresolved: string[] = [];
        const walk = (node: unknown, at: string): void => {
            if (!node || typeof node !== 'object') return;
            const ref = (node as { $ref?: unknown }).$ref;
            if (typeof ref === 'string') {
                let target: unknown = doc;
                for (const part of ref.replace(/^#\//, '').split('/')) {
                    target = (target as Record<string, unknown> | undefined)?.[part];
                }
                if (target === undefined) unresolved.push(`${ref} at ${at}`);
            }
            for (const [k, v] of Object.entries(node)) walk(v, `${at}/${k}`);
        };
        walk(doc.paths, '#/paths');
        expect(unresolved).toEqual([]);
    });

    it('declares each path parameter on every operation of that path', () => {
        const problems: string[] = [];
        for (const { key, path, item, op } of operations()) {
            const inPath = [...path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
            const declared = new Set(
                [...(item.parameters ?? []), ...(op.parameters ?? [])]
                    .filter((p): p is OpenAPIV3.ParameterObject => !('$ref' in p))
                    .filter(p => p.in === 'path')
                    .map(p => p.name)
            );
            const missing = inPath.filter(n => !declared.has(n));
            const extra = [...declared].filter(n => !inPath.includes(n));
            if (missing.length || extra.length) {
                problems.push(`${key} missing [${missing}] extra [${extra}]`);
            }
        }
        expect(problems).toEqual([]);
    });

    it('has no two paths that differ only by parameter names', () => {
        const byShape = new Map<string, string[]>();
        for (const path of Object.keys(doc.paths)) {
            const shape = path.replace(/\{[^}]+\}/g, '{}');
            byShape.set(shape, [...(byShape.get(shape) ?? []), path]);
        }
        expect([...byShape.values()].filter(paths => paths.length > 1)).toEqual([]);
    });

    it('names only security schemes the document defines', () => {
        const defined = new Set(Object.keys(doc.components?.securitySchemes ?? {}));
        const unknown = operations().flatMap(({ key, op }) =>
            (op.security ?? []).flatMap(req =>
                Object.keys(req)
                    .filter(name => !defined.has(name))
                    .map(name => `${key}: ${name}`)
            )
        );
        expect(unknown).toEqual([]);
    });

    it('tags every operation', () => {
        const untagged = operations()
            .filter(({ op }) => !op.tags?.length)
            .map(({ key }) => key);
        expect(untagged).toEqual([]);
    });

    it('documents the body of operator routes that read one', () => {
        const withBody = [
            'POST /operator/users',
            'PUT /operator/users/{userId}/password',
            'PATCH /operator/users/{userId}',
            'PATCH /operator/projects/{projectId}',
            'PATCH /operator/plugins/{pluginId}',
            'PUT /operator/schemas/{kind}/{name}',
            'POST /operator/operators'
        ];
        const byKey = new Map(operations().map(o => [o.key, o.op]));
        expect(withBody.filter(key => !byKey.get(key)?.requestBody)).toEqual([]);
    });
});
