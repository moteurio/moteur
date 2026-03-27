/* global console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src');
const TYPE_LINE = "import type { Request, Response } from 'express';";

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
            let s = fs.readFileSync(p, 'utf8');
            if (!s.includes('req: Request')) continue;
            if (s.includes(TYPE_LINE)) continue;
            const lines = s.split(/\r?\n/);
            let i = 0;
            if (lines[0]?.startsWith('#!')) i = 1;
            lines.splice(i, 0, TYPE_LINE);
            fs.writeFileSync(p, lines.join('\n'));
        }
    }
}

walk(root);
console.log('done');
