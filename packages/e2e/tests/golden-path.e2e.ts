import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMoteurAdminClient, createMoteurPublicClient } from '@moteurio/client';
import { startTarget, type E2eTarget } from './server.js';

/**
 * The path every Moteur user takes, through the published client against a real server: sign
 * in, create a project, define a model, write and publish an entry, read it on a site with a
 * project API key, and find the change in the project's Git history. The steps run in order and
 * share state; the project is deleted at the end, even when a step fails.
 */
describe('golden path', () => {
    let target: E2eTarget;
    let admin: ReturnType<typeof createMoteurAdminClient>;
    let projectCreated = false;
    const projectId = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const modelId = 'post';
    const entryId = 'hello-world';
    let apiKey = '';

    beforeAll(async () => {
        target = await startTarget();
    });

    afterAll(async () => {
        if (projectCreated) await admin.projects.delete(projectId).catch(() => {});
        await target?.stop();
    });

    it('signs in with email and password', async () => {
        const anonymous = createMoteurAdminClient({ baseURL: target.baseURL });
        const { token, user } = await anonymous.auth.login(target.email, target.password);
        expect(token).toBeTruthy();
        expect(user.email).toBe(target.email);
        admin = createMoteurAdminClient({
            baseURL: target.baseURL,
            auth: { type: 'bearer', token }
        });
    });

    it('creates a project', async () => {
        const project = await admin.projects.create({
            id: projectId,
            label: 'E2E project',
            defaultLocale: 'en'
        });
        projectCreated = true;
        expect(project.id).toBe(projectId);
    });

    it('defines a model', async () => {
        const model = await admin.forProject(projectId).models.create({
            id: modelId,
            label: 'Post',
            fields: {
                title: { type: 'core/text', label: 'Title' }
            }
        });
        expect(model.id).toBe(modelId);
    });

    it('saves an entry as a draft, then publishes it', async () => {
        const p = admin.forProject(projectId);
        const entry = await p.entries.create(modelId, {
            id: entryId,
            data: { title: 'Hello, world' }
        });
        expect(entry.id).toBe(entryId);
        // A new entry is a draft; the server leaves the status out until it changes.
        expect(entry.status ?? 'draft').toBe('draft');

        const changed = await p.entries.status(modelId, entryId, 'published');
        expect(changed.status).toBe('published');
        const { entry: published } = await p.entries.get(modelId, entryId);
        expect(published.status).toBe('published');
    });

    it('records the entry in the Git history', async () => {
        const revisions = await admin.get<unknown[]>(
            `/projects/${projectId}/models/${modelId}/entries/${entryId}/revisions`
        );
        expect(Array.isArray(revisions)).toBe(true);
        expect(revisions.length).toBeGreaterThan(0);
    });

    it('delivers the published entry to a site through a channel and an API key', async () => {
        const p = admin.forProject(projectId);
        const channel = await p.channels.create({
            label: 'E2E site',
            resources: [{ resourceType: 'model', resourceId: modelId }]
        });
        const channelId = String(channel.id);
        ({ rawKey: apiKey } = await p.apiKeys.create({ label: 'e2e' }));
        expect(apiKey).toBeTruthy();

        const site = createMoteurPublicClient({ baseURL: target.baseURL, projectId, apiKey });
        const entries = await site.channel(channelId).entries.list(modelId);
        expect(entries.map(e => e.id)).toContain(entryId);
        const delivered = await site.channel(channelId).entries.get(modelId, entryId);
        expect(JSON.stringify(delivered)).toContain('Hello, world');
    });

    it('refuses writes with the read-only API key', async () => {
        const response = await fetch(
            `${target.baseURL}/projects/${projectId}/models/${modelId}/entries`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ id: 'intruder', data: { title: 'No' } })
            }
        );
        expect([401, 403]).toContain(response.status);
    });

    it('deletes the project', async () => {
        await admin.projects.delete(projectId);
        projectCreated = false;
        const { projects } = await admin.projects.list();
        expect(projects.map(p => p.id)).not.toContain(projectId);
    });
});
