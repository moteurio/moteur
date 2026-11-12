import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { StateStore, read, write, patch, ensureProjectState } from '../../src/utils/stateStore.js';
import { ACTIVITY_KEY, COMMENTS_KEY, REVIEWS_KEY, RADAR_KEY } from '../../src/utils/storageKeys.js';

describe('StateStore', () => {
    let dataRoot: string;
    const projectId = 'testproj';

    beforeEach(async () => {
        dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-state-test-'));
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
            await ensureProjectState(projectId);
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
            expect(await StateStore.getActivity(projectId)).toEqual([]);
            await StateStore.setActivity(projectId, [{ e: 1 }]);
            expect(await StateStore.getActivity(projectId)).toEqual([{ e: 1 }]);
        });

        it('getComments / setComments', async () => {
            expect(await StateStore.getComments(projectId)).toEqual([]);
            await StateStore.setComments(projectId, [{ c: 1 }]);
            expect(await StateStore.getComments(projectId)).toEqual([{ c: 1 }]);
        });

        it('getReviews / setReviews', async () => {
            expect(await StateStore.getReviews(projectId)).toEqual([]);
            await StateStore.setReviews(projectId, [{ r: 1 }]);
            expect(await StateStore.getReviews(projectId)).toEqual([{ r: 1 }]);
        });

        it('getRadar / setRadar', async () => {
            expect(await StateStore.getRadar(projectId)).toBeNull();
            await StateStore.setRadar(projectId, { violations: [] });
            expect(await StateStore.getRadar(projectId)).toEqual({ violations: [] });
        });

        it('getSchedule / setSchedule / listScheduleIds', async () => {
            expect(await StateStore.getSchedule(projectId, 's1')).toBeNull();
            await StateStore.setSchedule(projectId, 's1', { id: 's1' });
            expect(await StateStore.getSchedule(projectId, 's1')).toEqual({ id: 's1' });
            expect(await StateStore.listScheduleIds(projectId)).toContain('s1');
        });
    });

    describe('ensureProjectState', () => {
        it('creates .moteur/ with empty defaults', async () => {
            await ensureProjectState(projectId);
            const activity = await read(projectId, ACTIVITY_KEY, []);
            expect(activity).toEqual([]);
            const radar = await read(projectId, RADAR_KEY, null);
            expect(radar).toBeNull();
        });
    });
});
