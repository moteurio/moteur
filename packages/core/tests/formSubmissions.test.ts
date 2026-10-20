import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    listSubmissions,
    getSubmission,
    createSubmission,
    deleteSubmission,
    querySubmissions,
    updateSubmission
} from '../src/formSubmissions.js';
import { createForm } from '../src/forms.js';
import type { FormSubmissionMeta } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'submissions-test-proj';
const formId = 'contact';
const user: User = {
    id: 'u1',
    name: 'Test User',
    isActive: true,
    email: 'u1@test.com',
    roles: [],
    projects: []
};

describe('formSubmissions', () => {
    let tempDir: string;
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-submissions-'));
        const projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'Test Project',
                defaultLocale: 'en',
                users: ['u1']
            }),
            'utf-8'
        );
        originalDataRoot = process.env.DATA_ROOT;
        process.env.DATA_ROOT = tempDir;
        await createForm(user, projectId, {
            id: formId,
            label: 'Contact',
            fields: { email: { type: 'core/text', label: 'Email', options: {} } },
            status: 'active',
            actions: [],
            createdAt: '',
            updatedAt: ''
        });
    });

    afterEach(async () => {
        if (originalDataRoot !== undefined) process.env.DATA_ROOT = originalDataRoot;
        else delete process.env.DATA_ROOT;
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    });

    describe('createSubmission', () => {
        it('stores submission with status received and returns it', async () => {
            const meta: FormSubmissionMeta = {
                submittedAt: new Date().toISOString(),
                ip: '127.0.0.1',
                userAgent: 'Test'
            };
            const data = { email: 'a@test.com', name: 'Alice' };
            const submission = await createSubmission(projectId, formId, data, meta);
            expect(submission.id).toBeDefined();
            expect(submission.formId).toBe(formId);
            expect(submission.projectId).toBe(projectId);
            expect(submission.data).toEqual(data);
            expect(submission.metadata).toEqual(meta);
            expect(submission.status).toBe('received');
            expect(submission.actionResults).toEqual([]);
        });

        it('throws when form not found', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            await expect(createSubmission(projectId, 'nonexistent-form', {}, meta)).rejects.toThrow(
                'not found'
            );
        });
    });

    describe('listSubmissions', () => {
        it('returns empty array when no submissions', async () => {
            const list = await listSubmissions(user, projectId, formId);
            expect(list).toEqual([]);
        });

        it('returns submissions after create', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            await createSubmission(projectId, formId, { a: '1' }, meta);
            await createSubmission(projectId, formId, { b: '2' }, meta);
            const list = await listSubmissions(user, projectId, formId);
            expect(list).toHaveLength(2);
        });

        it('respects status filter', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            await createSubmission(projectId, formId, {}, meta);
            const listSpam = await listSubmissions(user, projectId, formId, {
                status: 'spam'
            });
            expect(listSpam).toHaveLength(0);
            const listAll = await listSubmissions(user, projectId, formId);
            expect(listAll.length).toBeGreaterThanOrEqual(1);
        });

        it('respects limit option', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            for (let i = 0; i < 5; i++) {
                await createSubmission(projectId, formId, { i: String(i) }, meta);
            }
            const list = await listSubmissions(user, projectId, formId, { limit: 2 });
            expect(list).toHaveLength(2);
        });

        it('throws when form not found', async () => {
            await expect(listSubmissions(user, projectId, 'nonexistent-form')).rejects.toThrow(
                'not found'
            );
        });
    });

    describe('getSubmission', () => {
        it('returns submission by id', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            const created = await createSubmission(projectId, formId, { x: 'y' }, meta);
            const got = await getSubmission(user, projectId, formId, created.id);
            expect(got.id).toBe(created.id);
            expect(got.data).toEqual({ x: 'y' });
        });

        it('throws when submission not found', async () => {
            await expect(getSubmission(user, projectId, formId, 'nonexistent-id')).rejects.toThrow(
                'not found'
            );
        });

        it('throws for invalid submission id', async () => {
            await expect(getSubmission(user, projectId, formId, 'bad id')).rejects.toThrow(
                'Invalid submission ID'
            );
        });
    });

    describe('deleteSubmission', () => {
        it('permanently deletes submission (hard delete)', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            const created = await createSubmission(projectId, formId, {}, meta);
            // Wait for async processSubmission to finish so it does not overwrite after we delete
            await new Promise(resolve => setTimeout(resolve, 350));
            await deleteSubmission(user, projectId, formId, created.id);
            await expect(getSubmission(user, projectId, formId, created.id)).rejects.toThrow(
                'not found'
            );
        });

        it('throws when submission not found', async () => {
            await expect(
                deleteSubmission(user, projectId, formId, 'nonexistent-id')
            ).rejects.toThrow('not found');
        });
    });

    describe('processSubmission (indirect)', () => {
        it('submission is processed asynchronously and status becomes processed', async () => {
            const meta: FormSubmissionMeta = { submittedAt: new Date().toISOString() };
            const created = await createSubmission(
                projectId,
                formId,
                { email: 'b@test.com' },
                meta
            );
            expect(created.status).toBe('received');
            await new Promise(resolve => setTimeout(resolve, 300));
            const after = await getSubmission(user, projectId, formId, created.id);
            expect(after.status).toBe('processed');
            expect(Array.isArray(after.actionResults)).toBe(true);
        });
    });

    describe('the inbox', () => {
        const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
        const send = (day: number, extra: Partial<FormSubmissionMeta> = {}) =>
            createSubmission(
                projectId,
                formId,
                { email: `${day}@test.com` },
                { submittedAt: at(day), ...extra }
            );
        // Actions run in the background; give them a moment.
        const settle = () => new Promise(r => setTimeout(r, 50));

        it('lists newest first, pages, and counts total and unread', async () => {
            await send(3);
            await send(12);
            await send(7);
            await send(9, { honeypotTriggered: true });
            await settle();
            const page = await querySubmissions(user, projectId, formId, { offset: 1, limit: 2 });
            expect(page.submissions.map(s => s.metadata.submittedAt)).toEqual([at(9), at(7)]);
            expect(page.total).toBe(4);
            // Spam is never counted as unread.
            expect(page.unread).toBe(3);
        });

        it('marks read and unread, spam and not spam, keeping the rest', async () => {
            const s = await send(5);
            await settle();
            const read = await updateSubmission(user, projectId, formId, s.id, { read: true });
            expect(read.readAt).toBeTruthy();
            expect(read.readBy).toBe('u1');
            expect(read.status).toBe('processed');
            expect((await querySubmissions(user, projectId, formId, { unread: true })).total).toBe(
                0
            );

            const spam = await updateSubmission(user, projectId, formId, s.id, { spam: true });
            expect(spam.status).toBe('spam');
            expect(spam.readAt).toBe(read.readAt);
            const back = await updateSubmission(user, projectId, formId, s.id, {
                spam: false,
                read: false
            });
            expect(back.status).toBe('processed');
            expect(back.readAt).toBeUndefined();
            expect((await getSubmission(user, projectId, formId, s.id)).data).toEqual({
                email: '5@test.com'
            });
        });
    });
});
