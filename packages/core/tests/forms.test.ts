import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    listForms,
    getForm,
    getFormForProject,
    createForm,
    updateForm,
    deleteForm
} from '../src/forms.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'forms-test-proj';
const user: User = {
    id: 'u1',
    name: 'Test User',
    isActive: true,
    email: 'u1@test.com',
    roles: [],
    projects: []
};
const otherUser: User = {
    id: 'u2',
    name: 'Other',
    isActive: true,
    email: 'u2@test.com',
    roles: [],
    projects: []
};

describe('forms', () => {
    let tempDir: string;
    let projectDir: string;
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-forms-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test Project',
                defaultLocale: 'en',
                users: ['u1', 'u2']
            }),
            'utf-8'
        );
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('listForms', () => {
        it('returns empty array when no forms exist', async () => {
            const forms = await listForms(user, projectId);
            expect(forms).toEqual([]);
        });

        it('returns all forms after create', async () => {
            await createForm(user, projectId, {
                id: 'contact',
                label: 'Contact',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            await createForm(user, projectId, {
                id: 'newsletter',
                label: 'Newsletter',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            const forms = await listForms(user, projectId);
            expect(forms).toHaveLength(2);
            expect(forms.map(f => f.id).sort()).toEqual(['contact', 'newsletter']);
            expect(forms.find(f => f.id === 'contact')?.label).toBe('Contact');
        });

        it('throws for invalid projectId', async () => {
            await expect(listForms(user, '')).rejects.toThrow('Invalid projectId');
            await expect(listForms(user, 'bad id')).rejects.toThrow('Invalid projectId');
        });

        it('throws when user cannot access project', async () => {
            const restrictedProjectId = 'restricted-proj';
            const restrictedDir = path.join(tempDir, 'data', 'projects', restrictedProjectId);
            await fs.mkdir(restrictedDir, { recursive: true });
            await fs.writeFile(
                path.join(restrictedDir, 'project.json'),
                JSON.stringify({
                    id: restrictedProjectId,
                    label: 'Restricted',
                    users: ['u1']
                }),
                'utf-8'
            );
            await expect(listForms(otherUser, restrictedProjectId)).rejects.toThrow();
        });
    });

    describe('getForm', () => {
        it('returns form by id', async () => {
            await createForm(user, projectId, {
                id: 'contact',
                label: 'Contact',
                fields: { name: { type: 'core/text', label: 'Name', options: {} } },
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            const form = await getForm(user, projectId, 'contact');
            expect(form.id).toBe('contact');
            expect(form.label).toBe('Contact');
            expect(form.fields.name).toBeDefined();
            expect(form.status).toBe('active');
            expect(form.createdAt).toBeDefined();
            expect(form.updatedAt).toBeDefined();
        });

        it('throws when form not found', async () => {
            await expect(getForm(user, projectId, 'nonexistent')).rejects.toThrow('not found');
        });

        it('throws for invalid formId', async () => {
            await expect(getForm(user, projectId, '')).rejects.toThrow('Invalid formId');
        });
    });

    describe('getFormForProject', () => {
        it('returns form without user check', async () => {
            await createForm(user, projectId, {
                id: 'public-form',
                label: 'Public',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            const form = await getFormForProject(projectId, 'public-form');
            expect(form).not.toBeNull();
            expect(form?.id).toBe('public-form');
        });

        it('returns null when form not found', async () => {
            const form = await getFormForProject(projectId, 'missing');
            expect(form).toBeNull();
        });

        it('returns null for invalid formId', async () => {
            expect(await getFormForProject(projectId, '')).toBeNull();
        });
    });

    describe('createForm', () => {
        it('creates form with required fields and sets timestamps', async () => {
            const form: FormSchema = {
                id: 'contact',
                label: 'Contact Form',
                description: 'Get in touch',
                fields: { email: { type: 'core/text', label: 'Email', options: {} } },
                status: 'active',
                createdAt: '',
                updatedAt: ''
            };
            const created = await createForm(user, projectId, form);
            expect(created.id).toBe('contact');
            expect(created.label).toBe('Contact Form');
            expect(created.status).toBe('active');
            expect(created.honeypot).toBe(true);
            expect(created.fields).toEqual(form.fields);
            expect(created.createdAt).toBeDefined();
            expect(created.updatedAt).toBeDefined();
            expect(new Date(created.createdAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
        });

        it('defaults fields to empty object and honeypot to true', async () => {
            const created = await createForm(user, projectId, {
                id: 'minimal',
                label: 'Minimal',
                status: 'inactive',
                createdAt: '',
                updatedAt: ''
            } as FormSchema);
            expect(created.fields).toEqual({});
            expect(created.honeypot).toBe(true);
        });

        it('throws for invalid form id', async () => {
            await expect(
                createForm(user, projectId, {
                    id: 'bad id',
                    label: 'Bad',
                    fields: {},
                    status: 'active',
                    createdAt: '',
                    updatedAt: ''
                })
            ).rejects.toThrow('Invalid form id');
        });

        it('throws when form already exists', async () => {
            await createForm(user, projectId, {
                id: 'dup',
                label: 'First',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            await expect(
                createForm(user, projectId, {
                    id: 'dup',
                    label: 'Second',
                    fields: {},
                    status: 'active',
                    createdAt: '',
                    updatedAt: ''
                })
            ).rejects.toThrow('already exists');
        });
    });

    describe('updateForm', () => {
        it('merges patch and updates updatedAt', async () => {
            await createForm(user, projectId, {
                id: 'contact',
                label: 'Contact',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            const updated = await updateForm(user, projectId, 'contact', {
                label: 'Contact Us',
                description: 'Reach out'
            });
            expect(updated.label).toBe('Contact Us');
            expect(updated.description).toBe('Reach out');
            expect(updated.id).toBe('contact');
            expect(updated.updatedAt).toBeDefined();
            // updatedAt must be >= createdAt (may be equal in CI when create/update run in same ms)
            expect(new Date(updated.updatedAt!).getTime()).toBeGreaterThanOrEqual(
                new Date(updated.createdAt).getTime()
            );
        });

        it('throws when form not found', async () => {
            await expect(updateForm(user, projectId, 'missing', { label: 'New' })).rejects.toThrow(
                'not found'
            );
        });
    });

    describe('deleteForm', () => {
        it('soft-deletes form (moves file to trash)', async () => {
            await createForm(user, projectId, {
                id: 'to-delete',
                label: 'To Delete',
                fields: {},
                status: 'active',
                createdAt: '',
                updatedAt: ''
            });
            await deleteForm(user, projectId, 'to-delete');
            const form = await getFormForProject(projectId, 'to-delete');
            expect(form).toBeNull();
            const forms = await listForms(user, projectId);
            expect(forms.find(f => f.id === 'to-delete')).toBeUndefined();
        });

        it('throws when form not found', async () => {
            await expect(deleteForm(user, projectId, 'missing')).rejects.toThrow('not found');
        });
    });
});
