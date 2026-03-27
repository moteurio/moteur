import { describe, it, expect } from 'vitest';
import { applyProjectPatch } from '../../src/projects.js';
import { validateProject } from '../../src/validators/validateProject.js';
import type { ProjectSchema } from '@moteurio/types/Project.js';

function base(): ProjectSchema {
    return {
        id: 'demo',
        label: 'Demo',
        defaultLocale: 'en'
    };
}

describe('applyProjectPatch', () => {
    it('merges shallowly like updateProject', () => {
        const current = { ...base(), git: { remoteUrl: 'https://example.com/r.git' } };
        const merged = applyProjectPatch(current, { git: { enabled: true } });
        expect(merged.git).toEqual({ enabled: true });
    });

    it('removes top-level keys when patch value is null', () => {
        const current = { ...base(), description: 'x' };
        const merged = applyProjectPatch(current, { description: null } as Partial<ProjectSchema>);
        expect('description' in merged).toBe(false);
    });
});

describe('validateProject on merged PATCH', () => {
    it('accepts partial patch merged with existing project (git only)', () => {
        const merged = applyProjectPatch(base(), { git: { enabled: true } });
        const result = validateProject(merged, { existingProjectId: 'demo' });
        expect(result.valid).toBe(true);
    });
});
