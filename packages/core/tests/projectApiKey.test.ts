import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../src/projects.js', () => ({
    getProject: vi.fn(),
    getProjectById: vi.fn(),
    updateProject: vi.fn()
}));

const { getProjectById } = await import('../src/projects.js');
const { verifyKey } = await import('../src/projectApiKey.js');

const HASH_ALGORITHM = 'sha256';
function hashKey(rawKey: string): string {
    return crypto.createHash(HASH_ALGORITHM).update(rawKey, 'utf8').digest('hex');
}

describe('projectApiKey.verifyKey', () => {
    const projectId = 'test-proj';
    const rawKey = 'mk_live_' + 'a'.repeat(64);
    const storedHash = hashKey(rawKey);

    beforeEach(() => {
        vi.mocked(getProjectById).mockReset();
    });

    it('returns true when key matches stored hash', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [{ id: 'kid', hash: storedHash, prefix: 'mk_live_...', createdAt: '' }]
        } as any);
        const result = await verifyKey(projectId, rawKey);
        expect(result).toBe(true);
    });

    it('returns false when key does not match', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [{ id: 'kid', hash: storedHash, prefix: 'mk_live_...', createdAt: '' }]
        } as any);
        const result = await verifyKey(projectId, 'mk_live_wrong');
        expect(result).toBe(false);
    });

    it('returns false when project has no api keys', async () => {
        vi.mocked(getProjectById).mockResolvedValue({ id: projectId, apiKeys: [] } as any);
        const result = await verifyKey(projectId, rawKey);
        expect(result).toBe(false);
    });

    it('returns false when project not found', async () => {
        vi.mocked(getProjectById).mockResolvedValue(null);
        const result = await verifyKey(projectId, rawKey);
        expect(result).toBe(false);
    });

    it('returns false for empty or whitespace key', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [{ id: 'kid', hash: storedHash, prefix: 'mk_live_...', createdAt: '' }]
        } as any);
        expect(await verifyKey(projectId, '')).toBe(false);
        expect(await verifyKey(projectId, '   ')).toBe(false);
    });

    it('trims key before hashing', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [{ id: 'kid', hash: storedHash, prefix: 'mk_live_...', createdAt: '' }]
        } as any);
        const result = await verifyKey(projectId, '  ' + rawKey + '  ');
        expect(result).toBe(true);
    });
});
