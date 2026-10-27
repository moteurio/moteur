import { describe, it, expect, vi } from 'vitest';
import type { MoteurClient } from '../src/client.js';
import { MoteurApiError } from '../src/client.js';
import { publicFormsApi } from '../src/public/forms.js';

function fakeClient() {
    return { get: vi.fn(), post: vi.fn() };
}

const apiError = (status: number, data: Record<string, unknown>) =>
    new MoteurApiError(String(data.error), { status, response: { data } });

describe('public forms', () => {
    it('shows a form in one language, and asks for a token', async () => {
        const client = fakeClient();
        const forms = publicFormsApi(client as unknown as MoteurClient, 'demo');
        client.get.mockResolvedValueOnce({ id: 'contact' });
        await forms.get('site', 'contact', { locale: 'fr' });
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/channels/site/forms/contact', {
            locale: 'fr'
        });
        client.get.mockResolvedValueOnce({ token: '17.sig' });
        expect(await forms.token('contact')).toBe('17.sig');
        expect(client.get).toHaveBeenLastCalledWith('/projects/demo/forms/contact/token');
    });

    it('sends the answers with the token, captcha and language beside them', async () => {
        const client = fakeClient();
        const forms = publicFormsApi(client as unknown as MoteurClient, 'demo');
        client.post.mockResolvedValue({ success: true, submissionId: 's1', message: 'Merci' });
        const result = await forms.submit(
            'contact',
            { name: 'Lise' },
            { locale: 'fr', token: '17.sig', captcha: 'XXXX' }
        );
        expect(result).toEqual({ ok: true, submissionId: 's1', message: 'Merci' });
        expect(client.post).toHaveBeenCalledWith('/projects/demo/forms/contact/submit', {
            name: 'Lise',
            _locale: 'fr',
            _token: '17.sig',
            _captcha: 'XXXX'
        });
    });

    it('answers the issues to fix, and the captcha to redo, instead of throwing', async () => {
        const client = fakeClient();
        const forms = publicFormsApi(client as unknown as MoteurClient, 'demo');
        const issues = [
            { field: 'email', code: 'invalid', message: 'doit être une adresse courriel' }
        ];
        client.post.mockRejectedValueOnce(
            apiError(422, {
                error: 'Vérifiez cette réponse : Courriel.',
                code: 'ANSWERS_INVALID',
                issues
            })
        );
        expect(await forms.submit('contact', { email: 'x' })).toEqual({
            ok: false,
            reason: 'answers',
            message: 'Vérifiez cette réponse : Courriel.',
            issues
        });
        client.post.mockRejectedValueOnce(
            apiError(400, { error: 'Please confirm…', code: 'CAPTCHA_FAILED' })
        );
        expect(await forms.submit('contact', {})).toEqual({
            ok: false,
            reason: 'captcha',
            message: 'Please confirm…'
        });
        client.post.mockRejectedValueOnce(apiError(404, { error: 'Form not found' }));
        await expect(forms.submit('gone', {})).rejects.toBeInstanceOf(MoteurApiError);
    });
});
