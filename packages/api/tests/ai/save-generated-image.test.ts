import { OPERATOR_ROLE_SLUG } from '@moteurio/types';

import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiRouter } from '@moteurio/ai';

vi.mock('../../src/middlewares/auth', () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = {
            id: 'user1',
            name: 'User',
            email: 'u@test.com',
            roles: [OPERATOR_ROLE_SLUG],
            isActive: true
        };
        next();
    }
}));

vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            status: 200,
            data: Buffer.from('fake-png-bytes'),
            headers: { 'content-type': 'image/png' }
        })
    }
}));

const mockUploadAsset = vi.fn();
vi.mock('@moteurio/core/assets/assetService.js', () => ({
    uploadAsset: (...args: any[]) => mockUploadAsset(...args)
}));

vi.mock('@moteurio/core/projects', () => ({
    getProject: vi.fn().mockResolvedValue({
        id: 'p1',
        users: ['user1'],
        assetConfig: {}
    })
}));

const noop = (_req: any, _res: any, next: () => void) => next();

function createAiRouterApp() {
    const routeContext = {
        requireAuth: (req: any, _res: any, next: () => void) => {
            req.user = {
                id: 'user1',
                name: 'User',
                email: 'u@test.com',
                roles: [OPERATOR_ROLE_SLUG],
                isActive: true
            };
            next();
        },
        requireProjectAccess: noop,
        requireOperator: noop
    };
    const app = express();
    app.use(express.json());
    app.use('/ai', createAiRouter(routeContext));
    return app;
}

describe('POST /ai/save-generated-image (plugin)', () => {
    let app: express.Express;

    beforeEach(() => {
        mockUploadAsset.mockReset();
        mockUploadAsset.mockResolvedValue({
            id: 'asset-1',
            projectId: 'p1',
            url: 'https://storage/asset-1.png',
            localUrl: 'https://storage/asset-1.png',
            type: 'image',
            generationPrompt: 'a cat',
            aiProvider: 'openai/dall-e-3',
            aiGenerated: true
        });
        app = createAiRouterApp();
    });

    it('returns 400 when variantUrl or projectId missing', async () => {
        const res = await request(app)
            .post('/ai/save-generated-image')
            .send({ prompt: 'a cat', provider: 'openai/dall-e-3', aspectRatio: '1:1' });
        expect(res.status).toBe(400);
    });

    it('returns 403 when user not in project', async () => {
        const { getProject } = await import('@moteurio/core/projects.js');
        vi.mocked(getProject).mockResolvedValueOnce({ id: 'p1', users: ['other-user'] } as any);
        const res = await request(app).post('/ai/save-generated-image').send({
            variantUrl: 'https://provider.com/img.png',
            prompt: 'a cat',
            provider: 'openai/dall-e-3',
            aspectRatio: '1:1',
            projectId: 'p1'
        });
        expect(res.status).toBe(403);
    });

    it('returns 200 with asset including generationPrompt and aiGenerated', async () => {
        const res = await request(app).post('/ai/save-generated-image').send({
            variantUrl: 'https://provider.com/img.png',
            prompt: 'a cat',
            provider: 'openai/dall-e-3',
            aspectRatio: '1:1',
            projectId: 'p1'
        });
        expect(res.status).toBe(200);
        expect(res.body.asset).toBeDefined();
        expect(res.body.asset.generationPrompt).toBe('a cat');
        expect(res.body.asset.aiProvider).toBe('openai/dall-e-3');
        expect(res.body.asset.aiGenerated).toBe(true);
        expect(mockUploadAsset).toHaveBeenCalledWith(
            'p1',
            expect.any(Object),
            expect.objectContaining({
                buffer: expect.any(Buffer),
                originalName: expect.stringMatching(/generated-\d+\.(png|webp|jpg)/),
                mimeType: expect.stringMatching(/^image\//)
            }),
            expect.objectContaining({
                generationPrompt: 'a cat',
                aiProvider: 'openai/dall-e-3',
                aiGenerated: true
            })
        );
    });
});
