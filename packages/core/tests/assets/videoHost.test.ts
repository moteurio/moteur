import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import '../../src/assets/index.js';
import { initRepo } from '../../src/git/index.js';
import { registerProviderFactory } from '../../src/assets/providerRegistry.js';
import { getProjectAdapter } from '../../src/assets/adapterRegistry.js';
import type { VideoHostReport, VideoProvider } from '../../src/assets/VideoProvider.js';
import {
    forgetVideoHost,
    getProjectMediaSettings,
    updateProjectMediaSettings
} from '../../src/assets/mediaSettings.js';
import {
    checkVideoStatus,
    migrateProvider,
    moveVideosToHost,
    getAsset,
    resumeVideoUploads,
    retryVideoUpload,
    uploadAsset,
    whenVideoSent
} from '../../src/assets/assetService.js';
import { getProject } from '../../src/projects.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'video-host';
const admin = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    roles: ['admin'],
    projects: [projectId]
} as User;

/** Hosts standing in for Vimeo and Mux: take uploads, refuse them on demand, report when asked. */
type FakeHost = {
    refuse: boolean;
    uploads: { id: string; passthrough?: string; size: number }[];
    statuses: Map<string, VideoHostReport>;
    deleted: string[];
};
const fake = (): FakeHost => ({
    refuse: false,
    uploads: [],
    statuses: new Map(),
    deleted: []
});
const hosts = { vimeo: fake(), mux: fake() };
const host = hosts.vimeo;
for (const [id, h] of Object.entries(hosts) as ['vimeo' | 'mux', FakeHost][])
    registerProviderFactory(id, () => {
        const provider: VideoProvider = {
            id,
            label: `Fake ${id}`,
            async upload(buffer, _name, _mime, options) {
                if (h.refuse) throw new Error('Quota exceeded at the host');
                const pid = `${id[0]}${h.uploads.length + 1}`;
                h.uploads.push({ id: pid, passthrough: options?.passthrough, size: buffer.length });
                return { providerId: pid, providerStatus: 'processing', providerMetadata: {} };
            },
            async getStatus(providerId) {
                return h.statuses.get(providerId) ?? null;
            },
            async handleWebhook() {
                return null;
            },
            async delete(providerId) {
                h.deleted.push(providerId);
            },
            verifySignature: () => true
        };
        return provider;
    });

const video = (name = 'tour.mp4') => ({
    buffer: Buffer.from(`not really a video: ${name}`),
    originalName: name,
    mimeType: 'video/mp4'
});
const ready = (id: string): VideoHostReport => ({
    providerId: id,
    providerStatus: 'ready',
    providerMetadata: {
        streamUrl: `https://player.test/${id}.m3u8`,
        thumbnailUrl: `https://player.test/${id}.jpg`
    },
    duration: 42
});

describe('videos at a host', () => {
    let tempDir: string;
    let dir: string;
    const write = (keepLocalCopy = false) =>
        fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'en',
                users: ['u1', 'u2'],
                videoProviders: {
                    active: 'vimeo',
                    keepLocalCopy,
                    vimeo: { accessToken: 't', webhookSecret: 'w' }
                }
            })
        );
    beforeEach(async () => {
        for (const h of Object.values(hosts)) {
            Object.assign(h, { refuse: false, uploads: [], deleted: [] });
            h.statuses.clear();
        }
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-video-host-'));
        dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        await write();
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    /** The copy kept here, read through the project's storage. */
    const stored = async (p: string) =>
        getProjectAdapter(await getProject(admin, projectId)).download(p);

    it('answers at once, sends the video after, and drops the copy here once ready', async () => {
        const up = await uploadAsset(projectId, admin, video());
        expect(up.providerStatus).toBe('uploading');
        expect(up.path).toBeTruthy();
        expect(up.url).toBeTruthy(); // playable from here meanwhile

        await whenVideoSent(projectId, up.id);
        const sent = (await getAsset(projectId, up.id))!;
        expect(sent).toMatchObject({ providerStatus: 'processing', providerId: 'v1' });
        expect(host.uploads[0]).toMatchObject({ passthrough: up.id });

        // Still processing: asking changes nothing.
        expect((await checkVideoStatus(projectId, admin, up.id)).providerStatus).toBe('processing');
        expect((await stored(sent.path!)).toString()).toContain('tour.mp4');
        host.statuses.set('v1', ready('v1'));
        const done = await checkVideoStatus(projectId, admin, up.id);
        expect(done).toMatchObject({
            providerStatus: 'ready',
            url: 'https://player.test/v1.m3u8',
            duration: 42
        });
        expect(done.path).toBeUndefined();
        await expect(stored(sent.path!)).rejects.toThrow(/ENOENT/);
    });

    it('keeps the copy here when the project says so', async () => {
        await write(true);
        const up = await uploadAsset(projectId, admin, video());
        await whenVideoSent(projectId, up.id);
        host.statuses.set('v1', ready('v1'));
        const done = await checkVideoStatus(projectId, admin, up.id);
        expect(done.providerStatus).toBe('ready');
        expect(done.path).toBe(up.path);
    });

    it('says why the host refused it, and sends it again on request', async () => {
        host.refuse = true;
        const up = await uploadAsset(projectId, admin, video());
        await whenVideoSent(projectId, up.id);
        const refused = (await getAsset(projectId, up.id))!;
        expect(refused.providerStatus).toBe('error');
        expect(refused.providerMetadata?.error).toBe('Quota exceeded at the host');
        expect(refused.path).toBe(up.path);

        host.refuse = false;
        const again = await retryVideoUpload(projectId, admin, up.id);
        expect(again.providerStatus).toBe('uploading');
        await whenVideoSent(projectId, up.id);
        const sent = (await getAsset(projectId, up.id))!;
        expect(sent.providerStatus).toBe('processing');
        expect(sent.providerMetadata?.error).toBeUndefined();
        await expect(retryVideoUpload(projectId, admin, up.id)).rejects.toMatchObject({
            statusCode: 409
        });
    });

    it('picks up after a restart: sends what was left uploading', async () => {
        host.refuse = true;
        const up = await uploadAsset(projectId, admin, video());
        await whenVideoSent(projectId, up.id);
        // As if the server had stopped mid-upload.
        const file = path.join(dir, 'assets.json');
        const list = JSON.parse(await fs.readFile(file, 'utf8'));
        list[0].providerStatus = 'uploading';
        await fs.writeFile(file, JSON.stringify(list));

        host.refuse = false;
        expect(await resumeVideoUploads([await getProject(admin, projectId)])).toBe(1);
        await whenVideoSent(projectId, up.id);
        expect((await getAsset(projectId, up.id))?.providerStatus).toBe('processing');
    });

    describe('changing host', () => {
        const writer = { ...admin, id: 'u2', name: 'Wes', roles: ['writer'] } as User;
        const toMux = () =>
            updateProjectMediaSettings(projectId, admin, {
                videoProviders: {
                    active: 'mux',
                    mux: { tokenId: 'tid', tokenSecret: 'ts', webhookSecret: 'wh' }
                }
            });

        it('keeps the old host’s keys, and forgets them only once no video is there', async () => {
            const up = await uploadAsset(projectId, admin, video());
            await whenVideoSent(projectId, up.id);
            await toMux();
            const kept = (await getProject(admin, projectId)).videoProviders!;
            expect(kept.active).toBe('mux');
            expect(kept.vimeo?.accessToken).toBe('t');

            const settings = await getProjectMediaSettings(projectId, admin);
            expect(settings.videos).toEqual({ vimeo: { count: 1, withCopy: 1 } });
            await expect(forgetVideoHost(projectId, admin, 'vimeo')).rejects.toMatchObject({
                statusCode: 409,
                code: 'host_in_use'
            });
            await expect(forgetVideoHost(projectId, admin, 'mux')).rejects.toMatchObject({
                code: 'host_active'
            });
            // Turning hosts off keeps the keys too.
            await updateProjectMediaSettings(projectId, admin, { videoProviders: null });
            expect((await getProject(admin, projectId)).videoProviders?.mux?.tokenId).toBe('tid');
        });

        it('moves videos with a copy here, deleting them at the old host once ready', async () => {
            await write(true);
            const kept = await uploadAsset(projectId, admin, video('kept.mp4'));
            await whenVideoSent(projectId, kept.id);
            host.statuses.set('v1', ready('v1'));
            await checkVideoStatus(projectId, admin, kept.id);
            // One more at Vimeo whose copy here is gone: it stays there.
            await write(false);
            const gone = await uploadAsset(projectId, admin, video('gone.mp4'));
            await whenVideoSent(projectId, gone.id);
            host.statuses.set('v2', ready('v2'));
            await checkVideoStatus(projectId, admin, gone.id);
            await toMux();

            await expect(moveVideosToHost(projectId, writer)).rejects.toMatchObject({
                statusCode: 403
            });
            const result = await moveVideosToHost(projectId, admin, { removeFromOld: true });
            expect(result).toEqual({ to: 'mux', moving: 1, staying: 1 });
            const moving = (await getAsset(projectId, kept.id))!;
            expect(moving).toMatchObject({
                provider: 'mux',
                providerStatus: 'uploading',
                previousHost: { provider: 'vimeo', providerId: 'v1', remove: true }
            });

            await whenVideoSent(projectId, kept.id);
            expect(hosts.vimeo.deleted).toEqual([]); // not before Mux has it ready
            hosts.mux.statuses.set('m1', ready('m1'));
            const moved = await checkVideoStatus(projectId, admin, kept.id);
            expect(moved).toMatchObject({ provider: 'mux', providerStatus: 'ready' });
            expect(moved.previousHost).toBeUndefined();
            expect(hosts.vimeo.deleted).toEqual(['v1']);
            expect((await getAsset(projectId, gone.id))?.provider).toBe('vimeo');
        });

        it('brings videos back to this server when no host takes new ones', async () => {
            await write(true);
            const up = await uploadAsset(projectId, admin, video());
            await whenVideoSent(projectId, up.id);
            await updateProjectMediaSettings(projectId, admin, { videoProviders: null });
            expect(await moveVideosToHost(projectId, admin)).toEqual({
                to: 'local',
                moving: 1,
                staying: 0
            });
            const here = (await getAsset(projectId, up.id))!;
            expect(here.provider).toBeUndefined();
            expect(here.url).toMatch(/\/static\/assets\//);
            expect(hosts.vimeo.deleted).toEqual([]); // not asked to
        });

        it('keeps the old route per project and for admins', async () => {
            await expect(migrateProvider(admin, { toProvider: 'mux' })).rejects.toMatchObject({
                statusCode: 400
            });
            const wrongHost = await migrateProvider(admin, {
                toProvider: 'mux',
                projectIds: [projectId]
            });
            expect(wrongHost.errors).toBe(1);
            const notAdmin = await migrateProvider(writer, {
                toProvider: 'vimeo',
                projectIds: [projectId]
            });
            expect(notAdmin.errors).toBe(1);
        });
    });
});
