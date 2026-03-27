#!/usr/bin/env tsx
/**
 * Writes the merged OpenAPI 3 document (same as GET {basePath}/openapi.json at runtime).
 *
 * Usage (from monorepo root):
 *   pnpm --filter @moteurio/api run openapi:export
 *
 * Env: same as the API (optional plugins, AI, etc.). Loads moteur/.env when present.
 */
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const outDir = resolve(__dirname, '../dist-openapi');
const outFile = resolve(outDir, 'openapi.json');

const { buildMergedOpenApiDocument } = await import('../src/openapi/bootstrapApi.js');
const doc = await buildMergedOpenApiDocument();

await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(doc, null, 2), 'utf8');
console.log(`Wrote ${outFile}`);
