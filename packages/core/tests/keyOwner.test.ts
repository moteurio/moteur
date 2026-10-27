import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { findProjectForApiKey } from '../src/projectApiKey.js';

const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const siteKey = 'mk_live_' + 'a'.repeat(64);
const shopKey = 'mk_live_' + 'b'.repeat(64);

describe('the project a key belongs to', () => {
    let tempDir: string;

    const project = async (id: string, keys: string[]) => {
        const dir = path.join(tempDir, 'data', 'projects', id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            path.join(dir, 'project.json'),
            JSON.stringify({
                id,
                label: id,
                defaultLocale: 'en',
                users: [],
                apiKeys: keys.map((k, i) => ({
                    id: `k${i}`,
                    hash: sha(k),
                    prefix: 'mk_live_',
                    createdAt: ''
                }))
            })
        );
    };

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-key-owner-'));
        vi.stubEnv('DATA_ROOT', tempDir);
        await fs.mkdir(path.join(tempDir, 'data'), { recursive: true });
        await fs.writeFile(path.join(tempDir, 'data', 'users.json'), '[]');
        await project('site', [siteKey]);
        await project('shop', [shopKey]);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('is found from the key alone', () => {
        expect(findProjectForApiKey(siteKey)).toBe('site');
        expect(findProjectForApiKey(` ${shopKey} `)).toBe('shop');
    });

    it('is nobody for an unknown key or something that is not a key', () => {
        expect(findProjectForApiKey('mk_live_' + 'c'.repeat(64))).toBeNull();
        expect(findProjectForApiKey('Bearer x')).toBeNull();
        expect(findProjectForApiKey('')).toBeNull();
    });
});
