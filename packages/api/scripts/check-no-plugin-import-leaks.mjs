/* global console, process */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..', 'src');

const allowed = new Set(['@moteurio/plugin-sdk']);
const importRegex = /from\s+['"](@moteurio\/plugin-[^'"]+)['"]/g;
const issues = [];

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            walk(fullPath);
            continue;
        }
        if (!ent.name.endsWith('.ts')) continue;
        const source = fs.readFileSync(fullPath, 'utf8');
        for (const match of source.matchAll(importRegex)) {
            const mod = match[1];
            if (!allowed.has(mod)) {
                issues.push(`${path.relative(srcRoot, fullPath)} imports ${mod}`);
            }
        }
    }
}

walk(srcRoot);

if (issues.length > 0) {
    console.error('Plugin dependency leak detected in API runtime source:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
}

console.log('No plugin dependency leak found in API runtime source.');
