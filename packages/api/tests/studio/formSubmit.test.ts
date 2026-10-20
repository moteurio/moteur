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
});
