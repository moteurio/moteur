import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

vi.mock('../src/projects.js', () => ({
    getProject: vi.fn(),
    getProjectById: vi.fn(),
    updateProject: vi.fn()
}));

const { getProject, getProjectById, updateProject } = await import('../src/projects.js');
const { verifyKey, verifyProjectApiKey, parseApiKeyExpiry, rotateKey } =
    await import('../src/projectApiKey.js');

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

    it('refuses an expired key and says why', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [
                {
                    id: 'kid',
                    hash: storedHash,
                    prefix: 'mk_live_...',
                    createdAt: '2020-01-01T00:00:00.000Z',
                    expiresAt: '2020-02-01T00:00:00.000Z'
                }
            ]
        } as any);
        expect(await verifyProjectApiKey(projectId, rawKey)).toEqual({
            ok: false,
            reason: 'expired'
        });
    });

    it('accepts a key whose expiry is still ahead', async () => {
        vi.mocked(getProjectById).mockResolvedValue({
            id: projectId,
            apiKeys: [
                {
                    id: 'kid',
                    hash: storedHash,
                    prefix: 'mk_live_...',
                    createdAt: '',
                    expiresAt: new Date(Date.now() + 60_000).toISOString()
                }
            ]
        } as any);
        expect(await verifyKey(projectId, rawKey)).toBe(true);
    });
});

describe('projectApiKey expiry', () => {
    it('parses a future date, clears on null, ignores undefined', () => {
        const future = new Date(Date.now() + 86_400_000).toISOString();
        expect(parseApiKeyExpiry(future)).toBe(future);
        expect(parseApiKeyExpiry(null)).toBeNull();
        expect(parseApiKeyExpiry('')).toBeNull();
        expect(parseApiKeyExpiry(undefined)).toBeUndefined();
    });

    it('rejects past and malformed dates with a 400', () => {
        expect(() => parseApiKeyExpiry('2000-01-01T00:00:00Z')).toThrow(
            expect.objectContaining({ statusCode: 400 })
        );
        expect(() => parseApiKeyExpiry('soon')).toThrow(/ISO date-time/);
    });

    it('rotation keeps the lifetime, counted from now', async () => {
        const createdAt = '2020-01-01T00:00:00.000Z';
        const expiresAt = '2020-01-31T00:00:00.000Z';
        vi.mocked(getProject).mockResolvedValue({
            id: 'p',
            apiKeys: [{ id: 'kid', hash: 'x', prefix: 'mk_live_...', createdAt, expiresAt }]
        } as any);
        vi.mocked(updateProject).mockResolvedValue({} as any);
        const before = Date.now();
        const { meta } = await rotateKey('p', {} as any, 'kid');
        const lifetime = Date.parse(meta.expiresAt!) - Date.parse(meta.createdAt);
        expect(lifetime).toBe(30 * 86_400_000);
        expect(Date.parse(meta.createdAt)).toBeGreaterThanOrEqual(before);
        expect(meta.expired).toBe(false);
    });
});
