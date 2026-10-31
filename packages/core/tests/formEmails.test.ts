import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const sent: {
    to: string[];
    subject: string;
    text: string;
    html?: string;
    fromName?: string;
    replyTo?: string;
}[] = [];
let failWith: string | null = null;
vi.mock('../src/emailNotifier.js', () => ({
    sendEmail: vi.fn(async (m: (typeof sent)[number]) => {
        if (failWith) throw new Error(failWith);
        sent.push(m);
    })
}));

import { createForm, updateForm } from '../src/forms.js';
import { getEntry } from '../src/entries.js';
import { initRepo } from '../src/git/index.js';
import { putProjectJson } from '../src/utils/projectStorage.js';
import { modelKey } from '../src/utils/storageKeys.js';
import { createSubmission, fillIn, getSubmission } from '../src/formSubmissions.js';

const projectId = 'form-emails';
const user: User = {
    id: 'u1',
    name: 'Ada',
    isActive: true,
    email: '',
    roles: ['writer'],
    projects: []
};
const form = {
    id: 'contact',
    label: 'Contact',
    fields: {
        name: { type: 'core/text', label: { fr: 'Nom', en: 'Name' } },
        email: { type: 'core/email', label: 'Courriel' },
        message: { type: 'core/textarea', label: 'Message' }
    },
    actions: [
        { type: 'email', to: ['desk@journal.test'], subject: 'De {{name}}', body: '{{message}}' }
    ],
    notifications: {
        onSubmit: { to: ['team@journal.test'] },
        confirmationEmail: {
            fieldRef: 'email',
            subject: 'Merci {{name}}',
            body: { fr: 'Bien reçu, {{name}}.', en: 'Got it, {{name}}.' }
        }
    },
    createdAt: '',
    updatedAt: ''
} as unknown as FormSchema;

describe('form emails', () => {
    let tempDir: string;
    beforeEach(async () => {
        sent.length = 0;
        failWith = null;
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-form-emails-'));
        const dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'fr', users: ['u1'] })
        );
        vi.stubEnv('DATA_ROOT', tempDir);
        await initRepo(dir);
        await createForm(user, projectId, form);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const send = async () => {
        const s = await createSubmission(
            projectId,
            'contact',
            { name: 'Lise', email: 'lise@courriel.test', message: 'Quand paraît le numéro?' },
            { submittedAt: new Date().toISOString(), locale: 'en' }
        );
        // Actions run in the background: wait until they have, however busy the machine is.
        return vi.waitFor(
            async () => {
                const done = await getSubmission(user, projectId, 'contact', s.id);
                if (done.status === 'received') throw new Error('still processing');
                return done;
            },
            { timeout: 5000, interval: 20 }
        );
    };

    it('fills in answers for the action, tells the team, confirms to the sender', async () => {
        const done = await send();
        // The words as written; an HTML part headed by the project's name, sent under its name.
        const plain = sent.map(({ to, subject, text, replyTo }) => ({
            to,
            subject,
            text,
            ...(replyTo && { replyTo })
        }));
        expect(plain).toEqual([
            {
                to: ['desk@journal.test'],
                subject: 'De Lise',
                text: 'Quand paraît le numéro?',
                replyTo: 'lise@courriel.test'
            },
            {
                to: ['team@journal.test'],
                subject: 'New message: Contact',
                text: 'Nom:\nLise\n\nCourriel:\nlise@courriel.test\n\nMessage:\nQuand paraît le numéro?',
                replyTo: 'lise@courriel.test'
            },
            // In the language the sender wrote in.
            {
                to: ['lise@courriel.test'],
                subject: 'Merci Lise',
                // The project's words first, then what they sent.
                text: expect.stringMatching(/^Got it, Lise\.\n\nWhat you sent\n\nNom:\nLise\n/)
            }
        ]);
        for (const m of sent) {
            expect(m.fromName).toBe('P');
            expect(m.html).toContain('>P</span>');
        }
        expect(sent[1].html).toContain('lise@courriel.test');
        expect(sent[2].html).toContain('Got it, Lise.');
        expect(done.actionResults.map(r => `${r.type}:${r.status}`)).toEqual([
            'email:success',
            'notify:success',
            'confirm:success'
        ]);
    });

    it('records why an email did not go', async () => {
        failWith = 'Email is not set up on this server (SMTP_HOST and SMTP_FROM).';
        const done = await send();
        expect(done.status).toBe('processed');
        expect(done.actionResults).toEqual([
            { type: 'email', status: 'failed', error: failWith },
            { type: 'notify', status: 'failed', error: failWith },
            { type: 'confirm', status: 'failed', error: failWith }
        ]);
    });

    it('fills in any answer, lists and objects included', () => {
        expect(
            fillIn('{{ name }} — {{tags}} — {{address}} — {{missing}}', {
                name: 'Lise',
                tags: ['a', 'b'],
                address: { city: 'Montréal', country: 'CA' }
            })
        ).toBe('Lise — a, b — Montréal, CA — ');
    });

    it('creates a draft entry with answers mapped, leaving out what is not kept', async () => {
        await putProjectJson(projectId, modelKey('letter'), {
            id: 'letter',
            label: 'Letter',
            fields: {
                title: { type: 'core/text', label: 'Title' },
                body: { type: 'core/textarea', label: 'Body' }
            }
        });
        await updateForm(user, projectId, 'contact', {
            actions: [
                {
                    type: 'createEntry',
                    modelId: 'letter',
                    fieldMap: { name: 'title', message: 'body', email: '' }
                }
            ],
            notifications: null as never
        });
        const done = await send();
        const result = done.actionResults[0];
        expect(result).toMatchObject({ type: 'createEntry', status: 'success' });
        const entry = await getEntry(
            { ...user, roles: ['admin'], projects: [projectId] },
            projectId,
            'letter',
            result.entryId!
        );
        expect(entry.status).toBe('draft');
        expect(entry.data).toEqual({ title: 'Lise', body: 'Quand paraît le numéro?' });
    });
});
