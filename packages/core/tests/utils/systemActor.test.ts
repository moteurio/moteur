import { describe, it, expect } from 'vitest';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { assertUserCanAccessProject } from '../../src/utils/access.js';
import { isSystemActor, systemActor } from '../../src/utils/systemActor.js';

const project = { id: 'p', label: 'P', users: ['u1'] } as unknown as ProjectSchema;

describe('system actors', () => {
    it('may act in any project; people still need to be on its list', () => {
        expect(() =>
            assertUserCanAccessProject(systemActor('_forms', 'Forms'), project)
        ).not.toThrow();
        expect(() =>
            assertUserCanAccessProject(
                {
                    id: '_forms',
                    name: 'Forms',
                    isActive: true,
                    email: '',
                    roles: ['admin'],
                    projects: []
                },
                project
            )
        ).toThrow('does not have access');
    });

    it('cannot be faked from JSON (a token, a request body)', () => {
        const actor = systemActor('_scheduler', 'Scheduler');
        expect(isSystemActor(actor)).toBe(true);
        expect(isSystemActor(JSON.parse(JSON.stringify(actor)))).toBe(false);
        expect(isSystemActor({ ...actor })).toBe(true);
    });
});
