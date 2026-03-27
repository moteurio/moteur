#!/usr/bin/env tsx
/**
 * Fails if JSON success responses (2xx) are missing application/json content schema.
 * Reduces regressions in Scalar / generated clients.
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type { OpenAPIV3 } from 'openapi-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

function hasDocumentedContent(res: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject): boolean {
    if ('$ref' in res) return true;
    const content = res.content;
    if (!content) return false;
    return Object.values(content).some(media => Boolean(media?.schema));
}

function checkPath(pathKey: string, item: OpenAPIV3.PathItemObject): string[] {
    const issues: string[] = [];
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
    for (const m of methods) {
        const op = item[m];
        if (!op?.responses) continue;
        for (const [code, res] of Object.entries(op.responses)) {
            if (!/^(2)/.test(code)) continue;
            if (code === '204') continue;
            if (!hasDocumentedContent(res as OpenAPIV3.ResponseObject)) {
                issues.push(`${pathKey} ${m.toUpperCase()} ${code}`);
            }
        }
    }
    return issues;
}

const { buildMergedOpenApiDocument } = await import('../src/openapi/bootstrapApi.js');
const doc = await buildMergedOpenApiDocument();
const paths = doc.paths ?? {};
const allowlist = new Set<string>([]);

const failures: string[] = [];
for (const [p, item] of Object.entries(paths)) {
    if (!item) continue;
    for (const issue of checkPath(p, item)) {
        if (!allowlist.has(issue)) failures.push(issue);
    }
}

if (failures.length > 0) {
    console.error(
        'OpenAPI: success response missing documented content/schema:\n' + failures.join('\n')
    );
    process.exit(1);
}
console.log('OpenAPI response check passed.');
