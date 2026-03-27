import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { log, getLog, getProjectLog } from '../src/activityLogger.js';
import { onEvent } from '../src/utils/eventBus.js';
import type { ActivityEvent } from '@moteurio/types/Activity.js';

/** Wait for the next activity.logged event (after a log() call). */
function waitForActivityLogged(timeoutMs = 500): Promise<ActivityEvent> {
    return new Promise((resolve, reject) => {
        const t = globalThis.setTimeout(
            () => reject(new Error('timeout waiting for activity.logged')),
            timeoutMs
        );
        onEvent('activity.logged', async ctx => {
            globalThis.clearTimeout(t);
            resolve(ctx.event);
        });
    });
}

describe('activityLogger', () => {
    let tempDir: string;
    let projectDir: string;
    const projectId = 'activity-test-proj';
    let originalDataRoot: string | undefined;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-activity-'));
        projectDir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(projectDir, { recursive: true });
        await fs.writeFile(
            path.join(projectDir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'Test', defaultLocale: 'en' }),
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

    describe('getLog', () => {
        it('returns empty array when no activity file exists', async () => {
            const events = await getLog(projectId, 'entry', 'model1__e1');
            expect(events).toEqual([]);
        });

        it('returns events for the given resourceType and resourceId, newest first', async () => {
            const event1: ActivityEvent = {
                id: 'id-1',
                projectId,
                resourceType: 'entry',
                resourceId: 'article__post-1',
                action: 'created',
                userId: 'u1',
                userName: 'User One',
                timestamp: '2025-01-01T10:00:00.000Z'
            };
            const event2: ActivityEvent = {
                id: 'id-2',
                projectId,
                resourceType: 'entry',
                resourceId: 'article__post-1',
                action: 'updated',
                userId: 'u1',
                userName: 'User One',
                timestamp: '2025-01-01T11:00:00.000Z'
            };
            log(event1);
            await waitForActivityLogged();
            await new Promise(r => globalThis.setTimeout(r, 20)); // allow write to flush
            log(event2);
            await waitForActivityLogged();
            await new Promise(r => globalThis.setTimeout(r, 20));

            const events = await getLog(projectId, 'entry', 'article__post-1');
            expect(events).toHaveLength(2);
            expect(events[0].id).toBe('id-2');
            expect(events[1].id).toBe('id-1');
        });

        it('filters out other resources', async () => {
            const event: ActivityEvent = {
                id: 'id-1',
                projectId,
                resourceType: 'layout',
                resourceId: 'home',
                action: 'created',
                userId: 'u1',
                userName: 'User',
                timestamp: new Date().toISOString()
            };
            log(event);
            await waitForActivityLogged();

            const entryEvents = await getLog(projectId, 'entry', 'home');
            const layoutEvents = await getLog(projectId, 'layout', 'home');
            expect(entryEvents).toHaveLength(0);
            expect(layoutEvents).toHaveLength(1);
        });
    });

    describe('getProjectLog', () => {
        it('returns empty array when no activity file exists', async () => {
            const page = await getProjectLog(projectId);
            expect(page.events).toEqual([]);
        });

        it('returns recent events newest first with default limit', async () => {
            for (let i = 0; i < 3; i++) {
                log({
                    id: `id-${i}`,
                    projectId,
                    resourceType: 'model',
                    resourceId: `m${i}`,
                    action: 'created',
                    userId: 'u1',
                    userName: 'User',
                    timestamp: new Date().toISOString()
                });
                await waitForActivityLogged();
                await new Promise(r => globalThis.setTimeout(r, 20));
            }

            const page = await getProjectLog(projectId);
            expect(page.events).toHaveLength(3);
            expect(page.events[0].id).toBe('id-2');
            expect(page.events[2].id).toBe('id-0');
        });

        it('respects limit parameter', async () => {
            for (let i = 0; i < 5; i++) {
                log({
                    id: `id-${i}`,
                    projectId,
                    resourceType: 'entry',
                    resourceId: `m__e${i}`,
                    action: 'created',
                    userId: 'u1',
                    userName: 'User',
                    timestamp: new Date().toISOString()
                });
                await waitForActivityLogged();
                await new Promise(r => globalThis.setTimeout(r, 20));
            }

            const page = await getProjectLog(projectId, 2);
            expect(page.events).toHaveLength(2);
            expect(page.events[0].id).toBe('id-4');
            expect(page.events[1].id).toBe('id-3');
        });

        it('returns nextBefore when more events exist and supports before cursor', async () => {
            for (let i = 0; i < 5; i++) {
                log({
                    id: `id-${i}`,
                    projectId,
                    resourceType: 'model',
                    resourceId: `m${i}`,
                    action: 'created',
                    userId: 'u1',
                    userName: 'User',
                    timestamp: new Date().toISOString()
                });
                await waitForActivityLogged();
                await new Promise(r => globalThis.setTimeout(r, 20));
            }

            const first = await getProjectLog(projectId, 2);
            expect(first.events).toHaveLength(2);
            expect(first.nextBefore).toBeDefined();
            expect(first.events[0].id).toBe('id-4');
            expect(first.events[1].id).toBe('id-3');

            const second = await getProjectLog(projectId, 2, first.nextBefore);
            expect(second.events).toHaveLength(2);
            expect(second.events[0].id).toBe('id-2');
            expect(second.events[1].id).toBe('id-1');
        });
    });

    describe('log', () => {
        it('appends event and triggers activity.logged', async () => {
            const event: ActivityEvent = {
                id: 'ev-1',
                projectId,
                resourceType: 'structure',
                resourceId: 'core/block',
                action: 'updated',
                userId: 'u1',
                userName: 'Alice',
                timestamp: new Date().toISOString()
            };

            const loggedPromise = waitForActivityLogged();
            log(event);
            const emitted = await loggedPromise;

            expect(emitted).toMatchObject({
                id: 'ev-1',
                projectId,
                resourceType: 'structure',
                resourceId: 'core/block',
                action: 'updated',
                userId: 'u1',
                userName: 'Alice'
            });

            const page = await getProjectLog(projectId, 10);
            expect(page.events).toHaveLength(1);
            expect(page.events[0].id).toBe('ev-1');
        });

        it('does not throw when called with invalid projectId', () => {
            const event: ActivityEvent = {
                id: 'x',
                projectId: 'nonexistent-project-xyz',
                resourceType: 'entry',
                resourceId: 'm__e',
                action: 'created',
                userId: 'u',
                userName: 'U',
                timestamp: new Date().toISOString()
            };
            expect(() => log(event)).not.toThrow();
        });
    });
});
