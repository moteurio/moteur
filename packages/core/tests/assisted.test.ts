import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Entry, ModelSchema } from '@moteurio/types/Model.js';
import { initRepo } from '../src/git/index.js';
import { putProjectJson } from '../src/utils/projectStorage.js';
import { modelKey } from '../src/utils/storageKeys.js';
import { createEntry, updateEntry } from '../src/entries.js';
import { onEvent } from '../src/utils/eventBus.js';
import { addsAssisted, agentMarks, stampAssisted, unreadAssisted } from '../src/assisted.js';

describe('helper marks', () => {
    it('marks what an agent changed, per language, keeping other marks', () => {
        const before = {
            body: {
                helper: 'write' as const,
                keptBy: 'sophie',
                keptAt: 't0',
                readBy: 'sophie',
                readAt: 't0'
            }
        };
        const marks = agentMarks(
            before,
            { title: { fr: 'Glace', en: 'Ice' }, body: 'x', year: 1970 },
            { title: { fr: 'Glace', en: 'Under the ice' }, body: 'x', year: 1971 },
            'Claude',
            'louise',
            ['fr', 'en'],
            't1'
        );
        expect(marks).toEqual({
            body: before.body,
            'title.en': { helper: 'agent', action: 'Claude', keptBy: 'louise', keptAt: 't1' },
            year: { helper: 'agent', action: 'Claude', keptBy: 'louise', keptAt: 't1' }
        });
        expect(unreadAssisted(marks)).toEqual(['title.en', 'year']);
    });

    it('stamps who kept and who read, whatever the client claims', () => {
        const kept = stampAssisted(
            undefined,
            { 'title.en': { helper: 'translate', action: 'fr→en', keptBy: 'someone-else' } },
            'sophie',
            't1'
        );
        expect(kept).toEqual({
            'title.en': { helper: 'translate', action: 'fr→en', keptBy: 'sophie', keptAt: 't1' }
        });
        expect(unreadAssisted(kept)).toEqual(['title.en']);

        const read = stampAssisted(
            kept,
            { 'title.en': { helper: 'translate', action: 'fr→en', read: true } },
            'marguerite',
            't2'
        );
        expect(read!['title.en']).toMatchObject({
            keptBy: 'sophie',
            readBy: 'marguerite',
            readAt: 't2'
        });
        // Sent again as it was: still read, still by Marguerite.
        const again = stampAssisted(
            read,
            { 'title.en': { helper: 'translate', action: 'fr→en' } },
            'louise',
            't3'
        );
        expect(again!['title.en']).toMatchObject({ readBy: 'marguerite', readAt: 't2' });
        expect(addsAssisted(read, again)).toBe(false);
    });

    it('starts over when a new suggestion is kept, and forgets fields left out', () => {
        const first = stampAssisted(
            undefined,
            { body: { helper: 'write', action: 'shorten', read: true } },
            'sophie',
            't1'
        );
        const fresh = stampAssisted(
            first,
            { body: { helper: 'write', action: 'shorten', kept: true } },
            'sophie',
            't2'
        );
        expect(fresh!.body).toEqual({
            helper: 'write',
            action: 'shorten',
            keptBy: 'sophie',
            keptAt: 't2'
        });
        expect(addsAssisted(first, fresh)).toBe(true);
        expect(stampAssisted(fresh, {}, 'sophie')).toBeUndefined();
        expect(stampAssisted(fresh, null, 'sophie')).toBeUndefined();
    });

    it('refuses marks it cannot read', () => {
        expect(() => stampAssisted(undefined, { body: { helper: 'magic' } }, 'u')).toThrow(
            'helper'
        );
        expect(() => stampAssisted(undefined, { 'a b': { helper: 'write' } }, 'u')).toThrow(
            'field name'
        );
    });
});

describe('saving helper text', () => {
    const projectId = 'assisted-save';
    const sophie = {
        id: 'sophie',
        name: 'Sophie',
        isActive: true,
        roles: ['writer'],
        projects: [projectId]
    };
    const marguerite = { ...sophie, id: 'marguerite', name: 'Marguerite' };
    let tempDir: string;
    const messages: string[] = [];
    onEvent('content.saved', ctx => {
        messages.push((ctx as { message: string }).message);
    });

    beforeEach(async () => {
        messages.length = 0;
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-assisted-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id: projectId,
                label: 'P',
                defaultLocale: 'fr',
                supportedLocales: ['en'],
                users: ['sophie', 'marguerite']
            })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        await initRepo(dir);
        await putProjectJson(projectId, modelKey('article'), {
            id: 'article',
            label: 'Article',
            fields: {
                title: { type: 'core/text', label: 'Title', options: { multilingual: true } }
            }
        } as ModelSchema);
        await createEntry(sophie, projectId, 'article', {
            id: 'ungava',
            type: 'article',
            data: { title: { fr: 'Sous la glace' } }
        } as Entry);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('stamps the marks, says “with help” in history, and records who read it', async () => {
        const kept = await updateEntry(sophie, projectId, 'article', 'ungava', {
            data: { title: { fr: 'Sous la glace', en: 'Under the Ice' } },
            meta: {
                assisted: {
                    'title.en': { helper: 'translate', action: 'fr→en', keptBy: 'louise' } as never
                }
            }
        });
        expect(kept.meta?.assisted?.['title.en']).toMatchObject({
            helper: 'translate',
            keptBy: 'sophie'
        });
        expect(messages.at(-1)).toMatch(/^Update article\/ungava \(with help\) — Sophie$/);

        const read = await updateEntry(marguerite, projectId, 'article', 'ungava', {
            meta: {
                assisted: {
                    'title.en': { helper: 'translate', action: 'fr→en', read: true } as never
                }
            }
        });
        expect(read.meta?.assisted?.['title.en']).toMatchObject({
            keptBy: 'sophie',
            readBy: 'marguerite'
        });
        expect(messages.at(-1)).not.toContain('with help');
    });
});
