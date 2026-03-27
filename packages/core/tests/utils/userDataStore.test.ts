import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { UserDataStore } from '../../src/utils/userDataStore.js';
import { getProjectJson } from '../../src/utils/projectStorage.js';
import { submissionKey } from '../../src/utils/storageKeys.js';
import { getProjectLog } from '../../src/activityLogger.js';
import type { FormSubmission } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const testUser: User = {
    id: 'test-user',
    name: 'Test',
    isActive: true,
    email: 'test@test.com',
    roles: [],
    projects: []
};

describe('UserDataStore', () => {
    let dataRoot: string;
    const projectId = 'testproj';
    const formId = 'contact';

    beforeEach(async () => {
        dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-userdata-test-'));
        const projectsDir = path.join(dataRoot, 'data', 'projects');
        const projectDir = path.join(projectsDir, projectId);
        await fs.mkdir(projectDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', dataRoot);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(dataRoot, { recursive: true, force: true }).catch(() => {});
    });

    describe('saveSubmission', () => {
        it('file created at correct path', async () => {
            await UserDataStore.ensureUserData(projectId);
            const submission: FormSubmission = {
                id: 'sub1',
                formId,
                projectId,
                data: { name: 'Alice' },
                metadata: {},
                actionResults: [],
                status: 'received'
            };
            await UserDataStore.saveSubmission(projectId, formId, submission);
            const key = submissionKey(formId, 'sub1');
            const readBack = await getProjectJson<FormSubmission>(projectId, key);
            expect(readBack).not.toBeNull();
            expect(readBack!.id).toBe('sub1');
            expect(readBack!.data).toEqual({ name: 'Alice' });
        });
    });

    describe('deleteSubmission', () => {
        it('file removed, no recovery path, deletion logged to activity', async () => {
            await UserDataStore.ensureUserData(projectId);
            const submission: FormSubmission = {
                id: 'sub2',
                formId,
                projectId,
                data: {},
                metadata: {},
                actionResults: [],
                status: 'received'
            };
            await UserDataStore.saveSubmission(projectId, formId, submission);
            await UserDataStore.deleteSubmission(projectId, formId, 'sub2', testUser);
            const key = submissionKey(formId, 'sub2');
            const readBack = await getProjectJson<FormSubmission>(projectId, key);
            expect(readBack).toBeNull();
            await new Promise(r => setTimeout(r, 50));
            const log = await getProjectLog(projectId, 20);
            const deletedEvent = log.events.find(
                e =>
                    e.action === 'deleted' &&
                    e.resourceType === 'form' &&
                    String(e.resourceId).includes('sub2')
            );
            expect(deletedEvent).toBeDefined();
        });
    });

    describe('exportCollection', () => {
        it('JSON and CSV formats both correct', async () => {
            await UserDataStore.ensureUserData(projectId);
            await UserDataStore.saveSubmission(projectId, formId, {
                id: 'e1',
                formId,
                projectId,
                data: { name: 'A', score: 10 },
                metadata: {},
                actionResults: [],
                status: 'received'
            });
            const jsonOut = await UserDataStore.exportCollection(projectId, formId, 'json');
            expect(jsonOut.format).toBe('json');
            expect(jsonOut.data).toHaveLength(1);
            expect((jsonOut.data as FormSubmission[])[0].data).toEqual({ name: 'A', score: 10 });

            const csvOut = await UserDataStore.exportCollection(projectId, formId, 'csv');
            expect(csvOut.format).toBe('csv');
            expect(csvOut.data).toContain('e1');
            expect(csvOut.data).toContain('name');
            expect(csvOut.data).toContain('score');
        });
    });
});
