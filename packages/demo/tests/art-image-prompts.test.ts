import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    ART_IMAGE_PROMPT_SPECS,
    ART_IMAGE_PROMPTS_COMPLETE,
    renderArtPromptsYaml
} from '../src/journal/art-image-prompts.js';

const yamlPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../art-image-prompts.yaml'
);

describe('art-image-prompts', () => {
    it('has a complete prompt for every spec', () => {
        for (const spec of ART_IMAGE_PROMPT_SPECS) {
            const prompt = ART_IMAGE_PROMPTS_COMPLETE[spec.key];
            expect(prompt, spec.key).toBeTruthy();
            expect(prompt).toContain('1970s Canadian editorial');
            expect(prompt).toContain('Negative prompt:');
        }
        expect(ART_IMAGE_PROMPT_SPECS.length).toBeGreaterThanOrEqual(75);
    });

    it('matches packages/demo/art-image-prompts.yaml (run pnpm dump-art-prompts to refresh)', () => {
        expect(fs.existsSync(yamlPath)).toBe(true);
        expect(fs.readFileSync(yamlPath, 'utf8')).toBe(renderArtPromptsYaml());
    });
});
