import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (_req: any, _res: any, next: any) => next(),
    optionalProjectAccess: (_req: any, _res: any, next: any) => next(),
    requireProjectAdmin: (_req: any, _res: any, next: any) => next()
}));
vi.mock('../../src/middlewares/rateLimit.js', () => ({
    formsSubmitRateLimiter: (_req: any, _res: any, next: any) => next()
}));
vi.mock('@moteurio/core/forms.js', () => ({
    listForms: vi.fn(),
    getForm: vi.fn(),
    getFormForProject: vi.fn(),
    createForm: vi.fn(),
    updateForm: vi.fn(),
    deleteForm: vi.fn()
}));
vi.mock('@moteurio/core/formSubmissions.js', () => ({
    createSubmission: vi.fn(),
    querySubmissions: vi.fn(),
    getSubmission: vi.fn(),
    deleteSubmission: vi.fn(),
    updateSubmission: vi.fn()
}));

import formsRouter from '../../src/studio/forms/index.js';
import { getFormForProject } from '@moteurio/core/forms.js';
import { createSubmission } from '@moteurio/core/formSubmissions.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/forms', formsRouter);

describe('public form submit', () => {
    beforeEach(() => vi.clearAllMocks());

    it('takes a plain form post from any site and says thank you in its language', async () => {
        (getFormForProject as any).mockResolvedValue({
            id: 'contact',
            status: 'active',
            successMessage: { fr: 'Merci!', en: 'Thanks!' }
        });
        (createSubmission as any).mockResolvedValue({ id: 's1' });
        const res = await request(app)
            .post('/projects/demo/forms/contact/submit?locale=fr')
            .set('Origin', 'https://journal.example')
            .type('form')
            .send({ name: 'Lise', _honeypot: '' });
        expect(res.status).toBe(200);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.body).toEqual({ success: true, submissionId: 's1', message: 'Merci!' });
        expect(createSubmission).toHaveBeenCalledWith(
            'demo',
            'contact',
            { name: 'Lise' },
            expect.objectContaining({ locale: 'fr', honeypotTriggered: false })
        );
    });

    it('answers 422, readable from any site, when the answers don’t fit the form', async () => {
        (getFormForProject as any).mockResolvedValue({ id: 'contact', status: 'active' });
        const issues = [{ field: 'email', code: 'invalid', message: 'must be an email address' }];
        (createSubmission as any).mockRejectedValue(
            Object.assign(new Error('Please check this answer: Email.'), {
                statusCode: 422,
                code: 'ANSWERS_INVALID',
                issues
            })
        );
        const res = await request(app)
            .post('/projects/demo/forms/contact/submit')
            .set('Origin', 'https://journal.example')
            .type('form')
            .send({ email: 'nope' });
        expect(res.status).toBe(422);
        expect(res.headers['access-control-allow-origin']).toBe('*');
        expect(res.body).toMatchObject({
            error: 'Please check this answer: Email.',
            code: 'ANSWERS_INVALID',
            issues
        });
    });

    it('notes the page, the referrer and the campaign, not as answers', async () => {
        (getFormForProject as any).mockResolvedValue({ id: 'contact', status: 'active' });
        (createSubmission as any).mockResolvedValue({ id: 's2' });
        await request(app).post('/projects/demo/forms/contact/submit').type('form').send({
            name: 'Lise',
            _page: 'https://journal.example/contact?utm_source=newsletter',
            _referrer: 'https://www.google.com/'
        });
        expect(createSubmission).toHaveBeenCalledWith(
            'demo',
            'contact',
            { name: 'Lise' },
            expect.objectContaining({
                page: 'https://journal.example/contact?utm_source=newsletter',
                referrer: 'https://www.google.com/',
                campaign: { source: 'newsletter' }
            })
        );
    });
});
