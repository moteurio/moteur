import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
    WorkspaceStore,
    read,
    write,
    patch,
    ensureWorkspace
} from '../../src/utils/workspaceStore.js';
import { ACTIVITY_KEY, COMMENTS_KEY, REVIEWS_KEY, RADAR_KEY } from '../../src/utils/storageKeys.js';

describe('WorkspaceStore', () => {
    let dataRoot: string;
    const projectId = 'testproj';

    beforeEach(async () => {
        dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-workspace-test-'));
        const projectsDir = path.join(dataRoot, 'data', 'projects');
        const projectDir = path.join(projectsDir, projectId);
        await fs.mkdir(projectDir, { recursive: true });
        vi.stubEnv('DATA_ROOT', dataRoot);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(dataRoot, { recursive: true, force: true }).catch(() => {});
    });

    describe('read', () => {
        it('returns empty default when file does not exist', async () => {
            const out = await read(projectId, ACTIVITY_KEY, []);
            expect(out).toEqual([]);
        });

        it('returns default for missing key', async () => {
            const out = await read(projectId, '.moteur/radar.json', null);
            expect(out).toBeNull();
        });
    });

    describe('write', () => {
        it('writes and read round-trips (atomic via putProjectJson)', async () => {
            await write(projectId, ACTIVITY_KEY, [{ id: '1', action: 'created' }]);
            const out = await read(projectId, ACTIVITY_KEY, []);
            expect(out).toEqual([{ id: '1', action: 'created' }]);
        });
    });

    describe('patch', () => {
        it('reads current, applies patcher, writes result', async () => {
            await write(projectId, COMMENTS_KEY, [{ id: 'a' }]);
            const result = await patch(
                projectId,
                COMMENTS_KEY,
                (arr: unknown[]) => [...arr, { id: 'b' }],
                []
            );
            expect(result).toHaveLength(2);
            const readBack = await read(projectId, COMMENTS_KEY, []);
            expect(readBack).toHaveLength(2);
        });
    });

    describe('concurrency', () => {
        it('sequential patches do not corrupt JSON', async () => {
            await ensureWorkspace(projectId);
            await write(projectId, REVIEWS_KEY, []);
            for (let i = 0; i < 10; i++) {
                await patch(projectId, REVIEWS_KEY, (arr: unknown[]) => [...arr, { n: i }], []);
            }
            const final = await read(projectId, REVIEWS_KEY, []);
            expect(Array.isArray(final)).toBe(true);
            expect(final.length).toBe(10);
        });
    });

    describe('typed accessors', () => {
        it('getActivity / setActivity', async () => {
            expect(await WorkspaceStore.getActivity(projectId)).toEqual([]);
            await WorkspaceStore.setActivity(projectId, [{ e: 1 }]);
            expect(await WorkspaceStore.getActivity(projectId)).toEqual([{ e: 1 }]);
        });

        it('getComments / setComments', async () => {
            expect(await WorkspaceStore.getComments(projectId)).toEqual([]);
            await WorkspaceStore.setComments(projectId, [{ c: 1 }]);
            expect(await WorkspaceStore.getComments(projectId)).toEqual([{ c: 1 }]);
        });

        it('getReviews / setReviews', async () => {
            expect(await WorkspaceStore.getReviews(projectId)).toEqual([]);
            await WorkspaceStore.setReviews(projectId, [{ r: 1 }]);
            expect(await WorkspaceStore.getReviews(projectId)).toEqual([{ r: 1 }]);
        });

        it('getRadar / setRadar', async () => {
            expect(await WorkspaceStore.getRadar(projectId)).toBeNull();
            await WorkspaceStore.setRadar(projectId, { violations: [] });
            expect(await WorkspaceStore.getRadar(projectId)).toEqual({ violations: [] });
        });

        it('getSchedule / setSchedule / listScheduleIds', async () => {
            expect(await WorkspaceStore.getSchedule(projectId, 's1')).toBeNull();
            await WorkspaceStore.setSchedule(projectId, 's1', { id: 's1' });
            expect(await WorkspaceStore.getSchedule(projectId, 's1')).toEqual({ id: 's1' });
            expect(await WorkspaceStore.listScheduleIds(projectId)).toContain('s1');
        });
    });

    describe('ensureWorkspace', () => {
        it('creates .moteur/ with empty defaults', async () => {
            await ensureWorkspace(projectId);
            const activity = await read(projectId, ACTIVITY_KEY, []);
            expect(activity).toEqual([]);
            const radar = await read(projectId, RADAR_KEY, null);
            expect(radar).toBeNull();
        });
    });
});
