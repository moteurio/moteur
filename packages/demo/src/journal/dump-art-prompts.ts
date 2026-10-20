/** Writes packages/demo/art-image-prompts.yaml from art-image-prompts.ts */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_IMAGE_PROMPT_SPECS, renderArtPromptsYaml } from './art-image-prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../../art-image-prompts.yaml');

fs.writeFileSync(out, renderArtPromptsYaml(), 'utf8');
console.log(`Wrote ${out} (${ART_IMAGE_PROMPT_SPECS.length} prompts)`);
