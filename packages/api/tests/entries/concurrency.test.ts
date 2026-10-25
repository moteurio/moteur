import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entryVersion } from '@moteurio/core/utils/entryVersion.js';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), validate: vi.fn() }));
vi.mock('../../src/middlewares/auth.js', () => ({
    requireProjectAccess: (req: any, _res: any, next: () => void) => {
        req.user = { id: 'u1' };
        next();
    }
}));
vi.mock('@moteurio/core/entries.js', async () => ({
    mergeEntryPatch: (await vi.importActual<any>('@moteurio/core/entries.js')).mergeEntryPatch,
    getEntry: mocks.get,
    updateEntry: mocks.update
}));
vi.mock('@moteurio/core/models.js', () => ({
    getModelSchema: async () => ({ id: 'articles', fields: {} })
}));
vi.mock('@moteurio/core/projects.js', () => ({
    getProjectById: async () => ({ defaultLocale: 'en' })
}));
vi.mock('@moteurio/core/validators/validateEntry.js', () => ({ validateEntry: mocks.validate }));
import route from '../../src/entries/update.js';

const current = {
    id: 'e1',
    type: 'articles',
    status: 'draft' as const,
    data: { title: 'Original' }
};
function save(ifMatch?: string): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
        const req = {
            method: 'PATCH',
            url: '/e1',
            params: { projectId: 'p1', modelId: 'articles' },
            body: { data: { title: 'Changed' } },
            get: () => ifMatch
        };
        const res = {
            statusCode: 200,
            status(code: number) {
                this.statusCode = code;
                return this;
            },
            json(body: any) {
                resolve({ status: this.statusCode, body });
            }
        };
        (route as any).handle(req, res, (error: unknown) =>
            reject(error ?? new Error('Route not handled'))
        );
    });
}
describe('entry save preconditions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.get.mockResolvedValue(globalThis.structuredClone(current));
        mocks.update.mockResolvedValue(current);
        mocks.validate.mockResolvedValue({ valid: true });
    });
    it('passes the exact validated version into the locked core mutation', async () => {
        expect((await save(`"${entryVersion(current)}"`)).status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith(
            expect.anything(),
            'p1',
            'articles',
            'e1',
            { data: { title: 'Changed' } },
            { expectedVersion: entryVersion(current) }
        );
    });
    it('rejects stale client edits before validation or mutation', async () => {
        const response = await save('"stale"');
        expect(response.status).toBe(412);
        expect(response.body.code).toBe('ENTRY_CONFLICT');
        expect(mocks.validate).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('returns a conflict when a concurrent mutation wins during validation', async () => {
        mocks.update.mockRejectedValue(
            Object.assign(new Error('Entry changed'), { status: 409, code: 'ENTRY_CONFLICT' })
        );
        const response = await save();
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('ENTRY_CONFLICT');
    });
});
