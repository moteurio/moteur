/* global console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src');

function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
            let s = fs.readFileSync(p, 'utf8');
            const n = s.replace(/return res\./g, 'return void res.');
            if (n !== s) fs.writeFileSync(p, n);
        }
    }
}

walk(root);
console.log('done');
