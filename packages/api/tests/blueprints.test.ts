import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/middlewares/auth', () => ({
    requireAuth: (_req: any, _res: any, next: any) => {
        next();
    },
    requireOperator: (_req: any, _res: any, next: any) => {
        next();
    },
    requireAuthOrOperator: (_req: any, _res: any, next: any) => {
        next();
    }
}));

const mockListBlueprints = vi.fn();
const mockGetBlueprint = vi.fn();
const mockCreateBlueprint = vi.fn();
const mockUpdateBlueprint = vi.fn();
const mockDeleteBlueprint = vi.fn();

vi.mock('@moteurio/core/blueprints.js', () => ({
    listBlueprints: (...args: unknown[]) => mockListBlueprints(...args),
    getBlueprint: (...args: unknown[]) => mockGetBlueprint(...args),
    createBlueprint: (...args: unknown[]) => mockCreateBlueprint(...args),
    updateBlueprint: (...args: unknown[]) => mockUpdateBlueprint(...args),
    deleteBlueprint: (...args: unknown[]) => mockDeleteBlueprint(...args)
}));

import blueprintsRouter from '../src/blueprints/index.js';

const app = express();
app.use(express.json());
app.use('/blueprints', blueprintsRouter);

describe('GET /blueprints/projects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns list of project blueprints', async () => {
        const blueprints = [
            { id: 'empty', name: 'Empty Project', description: 'Start from scratch' },
            { id: 'blog', name: 'Blog Site', description: 'A blog template' }
        ];
        mockListBlueprints.mockReturnValue(blueprints);

        const res = await request(app).get('/blueprints/projects');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ blueprints });
        expect(mockListBlueprints).toHaveBeenCalledWith('project');
    });

    it('returns 500 when listBlueprints throws', async () => {
        mockListBlueprints.mockImplementation(() => {
            throw new Error('FS error');
        });

        const res = await request(app).get('/blueprints/projects');

        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({ error: 'FS error' });
    });
});

describe('GET /blueprints/projects/:blueprintId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns blueprint by id', async () => {
        const bp = { id: 'blog', name: 'Blog Site', description: 'Template' };
        mockGetBlueprint.mockReturnValue(bp);

        const res = await request(app).get('/blueprints/projects/blog');

        expect(res.status).toBe(200);
        expect(res.body).toEqual(bp);
        expect(mockGetBlueprint).toHaveBeenCalledWith('project', 'blog');
    });

    it('returns 404 when blueprint not found', async () => {
        mockGetBlueprint.mockImplementation(() => {
            throw new Error('Blueprint "project/missing" not found');
        });

        const res = await request(app).get('/blueprints/projects/missing');

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ error: expect.stringContaining('not found') });
    });

    it('returns 400 for invalid id', async () => {
        mockGetBlueprint.mockImplementation(() => {
            throw new Error('Invalid blueprint id: "bad id"');
        });

        const res = await request(app).get('/blueprints/projects/bad%20id');

        expect(res.status).toBe(400);
    });
});

describe('POST /blueprints/projects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates blueprint and returns 201', async () => {
        const body = { id: 'new-bp', name: 'New Blueprint', description: 'Desc' };
        mockCreateBlueprint.mockReturnValue({ ...body, kind: 'project' });

        const res = await request(app).post('/blueprints/projects').send(body);

        expect(res.status).toBe(201);
        expect(mockCreateBlueprint).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'new-bp', name: 'New Blueprint', kind: 'project' }),
            undefined
        );
    });

    it('returns 400 when id is missing', async () => {
        const res = await request(app)
            .post('/blueprints/projects')
            .send({ name: 'No Id', description: 'Missing id' });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ error: expect.stringContaining('id') });
        expect(mockCreateBlueprint).not.toHaveBeenCalled();
    });

    it('returns 400 when createBlueprint throws', async () => {
        mockCreateBlueprint.mockImplementation(() => {
            throw new Error('Invalid blueprint id: "x"');
        });

        const res = await request(app).post('/blueprints/projects').send({ id: 'x', name: 'X' });

        expect(res.status).toBe(400);
    });
});

describe('firstProject on project blueprints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('is listed, and passed through on create and update', async () => {
        mockListBlueprints.mockReturnValue([
            { id: 'starter', name: 'Starter', kind: 'project', firstProject: true }
        ]);
        const list = await request(app).get('/blueprints/projects');
        expect(list.body.blueprints[0].firstProject).toBe(true);

        const body = { id: 'starter', name: 'Starter', firstProject: true };
        mockCreateBlueprint.mockReturnValue({ ...body, kind: 'project' });
        const created = await request(app).post('/blueprints/projects').send(body);
        expect(created.status).toBe(201);
        expect(created.body.firstProject).toBe(true);
        expect(mockCreateBlueprint).toHaveBeenCalledWith(
            expect.objectContaining({ firstProject: true, kind: 'project' }),
            undefined
        );

        mockUpdateBlueprint.mockReturnValue({ ...body, firstProject: false });
        const updated = await request(app)
            .patch('/blueprints/projects/starter')
            .send({ firstProject: false });
        expect(updated.body.firstProject).toBe(false);
        expect(mockUpdateBlueprint).toHaveBeenCalledWith(
            'project',
            'starter',
            { firstProject: false },
            undefined
        );
    });

    it('answers 400 when it is not a boolean', async () => {
        const refuse = () => {
            throw new Error('Invalid blueprint: "firstProject" must be true or false');
        };
        mockCreateBlueprint.mockImplementation(refuse);
        mockUpdateBlueprint.mockImplementation(refuse);
        const created = await request(app)
            .post('/blueprints/projects')
            .send({ id: 'starter', name: 'Starter', firstProject: 'yes' });
        expect(created.status).toBe(400);
        const updated = await request(app)
            .patch('/blueprints/projects/starter')
            .send({ firstProject: 'yes' });
        expect(updated.status).toBe(400);
    });
});

describe('PATCH /blueprints/projects/:blueprintId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('updates blueprint and returns 200', async () => {
        const updated = { id: 'blog', name: 'Blog (updated)', description: 'New desc' };
        mockUpdateBlueprint.mockReturnValue(updated);

        const res = await request(app)
            .patch('/blueprints/projects/blog')
            .send({ name: 'Blog (updated)', description: 'New desc' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(updated);
        expect(mockUpdateBlueprint).toHaveBeenCalledWith(
            'project',
            'blog',
            {
                name: 'Blog (updated)',
                description: 'New desc'
            },
            undefined
        );
    });

    it('returns 404 when blueprint not found', async () => {
        mockUpdateBlueprint.mockImplementation(() => {
            throw new Error('Blueprint "project/x" not found');
        });

        const res = await request(app).patch('/blueprints/projects/x').send({ name: 'Y' });

        expect(res.status).toBe(404);
    });
});

describe('DELETE /blueprints/projects/:blueprintId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes blueprint and returns 204', async () => {
        mockDeleteBlueprint.mockReturnValue(undefined);

        const res = await request(app).delete('/blueprints/projects/blog');

        expect(res.status).toBe(204);
        expect(mockDeleteBlueprint).toHaveBeenCalledWith('project', 'blog', undefined);
    });

    it('returns 400 when deleteBlueprint throws', async () => {
        mockDeleteBlueprint.mockImplementation(() => {
            throw new Error('Invalid blueprint id: "bad!"');
        });

        const res = await request(app).delete('/blueprints/projects/bad!');

        expect(res.status).toBe(400);
    });
});

describe('GET /blueprints/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns list of model blueprints', async () => {
        const blueprints = [{ id: 'blog-post', name: 'Blog Post', kind: 'model' }];
        mockListBlueprints.mockReturnValue(blueprints);

        const res = await request(app).get('/blueprints/models');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ blueprints });
        expect(mockListBlueprints).toHaveBeenCalledWith('model');
    });
});

describe('GET /blueprints/structures', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns list of structure blueprints', async () => {
        const blueprints = [{ id: 'team-member', name: 'Team Member', kind: 'structure' }];
        mockListBlueprints.mockReturnValue(blueprints);

        const res = await request(app).get('/blueprints/structures');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ blueprints });
        expect(mockListBlueprints).toHaveBeenCalledWith('structure');
    });
});
