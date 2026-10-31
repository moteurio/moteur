import { describe, it, expect, vi } from 'vitest';
import type { MoteurClient } from '../src/client.js';
import { projectEmailApi } from '../src/project/email.js';
import { authApi } from '../src/admin/auth.js';

const fakeClient = () => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() });

describe('a project’s own mail', () => {
    it('reads, changes and previews it', async () => {
        const client = fakeClient();
        const email = projectEmailApi(client as unknown as MoteurClient);
        await email.get('café');
        expect(client.get).toHaveBeenCalledWith('/projects/caf%C3%A9/email');
        await email.update('café', { senderName: 'Café Olimpico', footer: null });
        expect(client.patch).toHaveBeenCalledWith('/projects/caf%C3%A9/email', {
            senderName: 'Café Olimpico',
            footer: null
        });
        await email.preview('café', { locale: 'fr', settings: { accent: '#8A3B12' } });
        expect(client.post).toHaveBeenCalledWith('/projects/caf%C3%A9/email/preview', {
            locale: 'fr',
            settings: { accent: '#8A3B12' }
        });
    });

    it('sends the page’s look with a code request, and saves a person’s look', async () => {
        const client = fakeClient();
        const auth = authApi(client as unknown as MoteurClient);
        await auth.emailCode({ email: 'lise@courriel.test', look: 'folio' });
        expect(client.post).toHaveBeenCalledWith('/auth/email/code', {
            email: 'lise@courriel.test',
            look: 'folio'
        });
        await auth.preferences({ look: 'discotheque', locale: 'fr' });
        expect(client.patch).toHaveBeenCalledWith('/auth/me/preferences', {
            look: 'discotheque',
            locale: 'fr'
        });
    });
});
