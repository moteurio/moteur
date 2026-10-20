import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: any) => {
        req.user = { id: 'user1', roles: ['editor'] };
        next();
    }
}));

vi.mock('@moteurio/core/formSubmissions.js', () => ({
    querySubmissions: vi.fn(),
    getSubmission: vi.fn(),
    deleteSubmission: vi.fn(),
    updateSubmission: vi.fn()
}));

vi.mock('@moteurio/core/utils/userDataStore.js', () => ({
    UserDataStore: { exportCollection: vi.fn() }
}));

import submissionsRouter from '../../src/studio/forms/submissions.js';
import { querySubmissions, updateSubmission } from '@moteurio/core/formSubmissions.js';
import { UserDataStore } from '@moteurio/core/utils/userDataStore.js';

const app = express();
app.use(express.json());
app.use('/projects/:projectId/forms/:formId/submissions', submissionsRouter);
const base = '/projects/demo/forms/contact/submissions';

describe('Submissions inbox routes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists a page with its counts', async () => {
        (querySubmissions as any).mockResolvedValue({ submissions: [], total: 12, unread: 3 });
        const res = await request(app).get(`${base}?unread=1&offset=20&limit=10`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ submissions: [], total: 12, unread: 3 });
        expect(querySubmissions).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'user1' }),
            'demo',
            'contact',
            { unread: true, offset: 20, limit: 10 }
        );
    });

    it('marks read or spam, and refuses anything but true or false', async () => {
        (updateSubmission as any).mockResolvedValue({ id: 's1', readAt: 'now' });
        const ok = await request(app).patch(`${base}/s1`).send({ read: true });
        expect(ok.status).toBe(200);
        expect(updateSubmission).toHaveBeenCalledWith(expect.anything(), 'demo', 'contact', 's1', {
            read: true
        });
        const bad = await request(app).patch(`${base}/s1`).send({ spam: 'yes' });
        expect(bad.status).toBe(400);
        expect(bad.body.error).toBe('"spam" must be true or false.');
    });

    it('downloads every submission as CSV, readable by spreadsheet apps', async () => {
        (querySubmissions as any).mockResolvedValue({ submissions: [], total: 0, unread: 0 });
        (UserDataStore.exportCollection as any).mockResolvedValue({
            format: 'csv',
            data: 'id,email\ns1,é@test.com'
        });
        const res = await request(app).get(`${base}/export`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toBe(
            'attachment; filename="contact-submissions.csv"'
        );
        expect(res.text).toBe('﻿id,email\ns1,é@test.com');
    });
});
