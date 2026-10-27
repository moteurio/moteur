import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createForm } from '../src/forms.js';
import { createSubmission, getSubmission, releaseSubmission } from '../src/formSubmissions.js';
import {
    registerFormAction,
    registerFormField,
    registerSubmissionHold,
    registerSubmissionScreen,
    resetFormExtensions
} from '../src/plugins/formExtensions.js';
import { createPluginContext, wrapPluginContext } from '../src/plugins/pluginContext.js';
import { ContributionCollector } from '../src/plugins/contributionCollector.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { User } from '@moteurio/types/User.js';

const projectId = 'plugin-forms';
const user: User = {
    id: 'u1',
    name: 'Louise',
    isActive: true,
    email: 'l@x.test',
    roles: [],
    projects: []
};
const meta = () => ({ submittedAt: new Date().toISOString() });
const settle = () => new Promise(r => setTimeout(r, 30));

async function makeForm(extra: Partial<FormSchema> = {}) {
    return createForm(user, projectId, {
        id: 'contact',
        label: 'Contact',
        status: 'active',
        fields: {
            email: { type: 'core/email', label: 'Email' },
            spot: { type: 'geo/location', label: 'Where' }
        },
        createdAt: '',
        updatedAt: '',
        ...extra
    } as FormSchema);
}

describe('what plugins add to forms', () => {
    let root: string;
    let previous: string | undefined;
    beforeEach(async () => {
        resetFormExtensions();
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-form-plugins-'));
        const dir = path.join(root, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({ id: projectId, label: 'P', defaultLocale: 'en', users: ['u1'] })
        );
        previous = process.env.DATA_ROOT;
        process.env.DATA_ROOT = root;
    });
    afterEach(async () => {
        resetFormExtensions();
        if (previous !== undefined) process.env.DATA_ROOT = previous;
        else delete process.env.DATA_ROOT;
        await fs.rm(root, { recursive: true, force: true });
    });

    it('runs a plugin action with the form’s settings, and keeps what it said', async () => {
        const run = vi.fn(async ({ config }: { config: Record<string, unknown> }) => ({
            status: 'success' as const,
            detail: `Row added to ${config.sheet}`
        }));
        registerFormAction({
            type: 'sheets:append',
            label: 'Add a row to a sheet',
            settings: { sheet: { type: 'core/text', label: 'Sheet', required: true } },
            check: config => (config.sheet ? undefined : 'name the sheet.'),
            run
        });
        await expect(
            makeForm({ actions: [{ type: 'sheets:append', config: {} }] })
        ).rejects.toThrow('action 1 (Add a row to a sheet): name the sheet.');
        await makeForm({ actions: [{ type: 'sheets:append', config: { sheet: 'Leads' } }] });
        const sent = await createSubmission(projectId, 'contact', { email: 'rose@x.test' }, meta());
        await settle();
        const kept = await getSubmission(user, projectId, 'contact', sent.id);
        expect(kept.status).toBe('processed');
        expect(kept.actionResults).toContainEqual({
            type: 'sheets:append',
            status: 'success',
            detail: 'Row added to Leads'
        });
        expect(run.mock.calls[0][0].submission.data).toEqual({ email: 'rose@x.test' });
    });

    it('refuses an action no plugin provides, and keeps a failing one from stopping the rest', async () => {
        await expect(makeForm({ actions: [{ type: 'crm:add' }] })).rejects.toThrow(
            'no plugin on this server provides "crm:add"'
        );
        registerFormAction({
            type: 'crm:add',
            label: 'CRM',
            run: async () => {
                throw new Error('CRM down');
            }
        });
        registerFormAction({
            type: 'slack:post',
            label: 'Slack',
            run: async () => ({ status: 'success' })
        });
        await makeForm({ actions: [{ type: 'crm:add' }, { type: 'slack:post' }] });
        const sent = await createSubmission(projectId, 'contact', {}, meta());
        await settle();
        const kept = await getSubmission(user, projectId, 'contact', sent.id);
        expect(kept.actionResults.map(r => [r.type, r.status, r.error])).toEqual([
            ['crm:add', 'failed', 'CRM down'],
            ['slack:post', 'success', undefined]
        ]);
    });

    it('checks a plugin field’s answers on the server, objects included', async () => {
        registerFormField({
            type: 'geo/location',
            check: value => {
                const v = value as { lat?: unknown; lng?: unknown };
                return typeof v?.lat === 'number' && typeof v?.lng === 'number'
                    ? { value: { lat: v.lat, lng: v.lng } }
                    : { issue: { code: 'invalid' } };
            }
        });
        await makeForm();
        await expect(
            createSubmission(projectId, 'contact', { spot: 'somewhere' }, meta())
        ).rejects.toMatchObject({
            code: 'ANSWERS_INVALID',
            issues: [{ field: 'spot', code: 'invalid' }]
        });
        const sent = await createSubmission(
            projectId,
            'contact',
            { spot: { lat: 45.5, lng: -73.6, x: 1 } },
            meta()
        );
        expect(sent.data.spot).toEqual({ lat: 45.5, lng: -73.6 });
    });

    it('keeps a letter a plugin calls spam quietly, and skips a slow check', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            registerSubmissionScreen({ id: 'slow', screen: () => new Promise(() => undefined) });
            registerSubmissionScreen({
                id: 'akismet',
                screen: async ({ data }) => ({
                    spam: String(data.email).includes('spam'),
                    note: 'Akismet: spam'
                })
            });
            const run = vi.fn(async () => ({ status: 'success' as const }));
            registerFormAction({ type: 'sheets:append', label: 'Sheet', run });
            await makeForm({ actions: [{ type: 'sheets:append' }] });
            const sending = createSubmission(
                projectId,
                'contact',
                { email: 'spam@x.test' },
                meta()
            );
            await vi.advanceTimersByTimeAsync(3_100);
            const sent = await sending;
            expect(sent.status).toBe('spam');
            expect(sent.metadata).toMatchObject({
                spamReason: 'screen',
                screenedBy: 'akismet',
                screenNote: 'Akismet: spam'
            });
            expect(run).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('holds a letter’s actions until its plugin releases it', async () => {
        const run = vi.fn(async () => ({ status: 'success' as const }));
        registerFormAction({ type: 'newsletter:subscribe', label: 'Subscribe', run });
        registerSubmissionHold({ id: 'double-opt-in', hold: async () => true });
        await makeForm({ actions: [{ type: 'newsletter:subscribe' }] });
        const sent = await createSubmission(projectId, 'contact', { email: 'rose@x.test' }, meta());
        await settle();
        expect(sent.status).toBe('held');
        expect(sent.metadata.heldBy).toBe('double-opt-in');
        expect(run).not.toHaveBeenCalled();
        const released = await releaseSubmission(projectId, 'contact', sent.id);
        expect(run).toHaveBeenCalledTimes(1);
        expect(released.status).toBe('processed');
        expect(released.metadata.heldBy).toBeUndefined();
        await expect(releaseSubmission(projectId, 'contact', sent.id)).rejects.toMatchObject({
            status: 409
        });
    });

    it('records what a plugin adds, and refuses a type another plugin owns', () => {
        const collector = new ContributionCollector();
        const ctx = wrapPluginContext(createPluginContext(), collector, 'sheets');
        ctx.registerFormAction({
            type: 'sheets:append',
            label: 'Sheet',
            run: async () => undefined
        });
        ctx.registerSubmissionHold({ id: 'sheets-hold', hold: async () => false });
        expect(collector.snapshot().forms).toEqual({
            actions: ['sheets:append'],
            holds: ['sheets-hold']
        });
        expect(() =>
            registerFormAction(
                { type: 'sheets:append', label: 'Other', run: async () => undefined },
                'other'
            )
        ).toThrow('already registered by another plugin');
        expect(() =>
            registerFormAction({ type: 'append', label: 'x', run: async () => undefined })
        ).toThrow('plugin:name');
    });
});
