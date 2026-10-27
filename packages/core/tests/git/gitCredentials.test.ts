import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { addAllAndCommit, initRepo, push, setRemoteOrigin } from '../../src/git/index.js';
import { gitAuthEnv, gitTokenInfo, removeGitToken, setGitToken } from '../../src/gitCredentials.js';

const projectId = 'creds';
const admin = { id: 'a1', name: 'Ada', isActive: true, roles: ['admin'] } as never;
const writer = { id: 'w1', name: 'Wes', isActive: true, roles: ['writer'] } as never;

describe('the Git token', () => {
    let tempDir: string;
    let dir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moteur-git-creds-'));
        dir = path.join(tempDir, 'data', 'projects', projectId);
        await fs.mkdir(dir, { recursive: true });
        vi.stubEnv('DATA_ROOT', tempDir);
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'a'.repeat(64));
        await initRepo(dir);
    });
    afterEach(async () => {
        vi.unstubAllEnvs();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('is kept encrypted, outside Git, and never shown again', async () => {
        expect(setGitToken(projectId, admin, { token: 'ghp_secret123' })).toEqual({
            hasToken: true,
            setAt: expect.any(String)
        });
        const raw = await fs.readFile(path.join(dir, '.moteur', 'secrets.json'), 'utf8');
        expect(raw).not.toContain('ghp_secret123');
        const ignored = await fs.readFile(path.join(dir, '.gitignore'), 'utf8');
        expect(ignored).toMatch(/^\.moteur\/?$/m);
        expect(gitTokenInfo(projectId)).not.toHaveProperty('token');

        expect(removeGitToken(projectId, admin)).toEqual({ hasToken: false });
        expect(gitAuthEnv(dir)).toBeUndefined();
    });

    it('refuses to keep a token in clear on a production server', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', '');
        expect(() => setGitToken(projectId, admin, { token: 'ghp_secret123' })).toThrow(
            'MOTEUR_ENCRYPTION_KEY'
        );
    });

    it('refuses anyone but an admin, and a token that could forge a header', () => {
        expect(() => setGitToken(projectId, writer, { token: 'ghp_secret123' })).toThrow(
            'Only an admin'
        );
        for (const token of ['short', 'ghp_x\r\nX-Evil: 1', 'has space inside'])
            expect(() => setGitToken(projectId, admin, { token })).toThrow('no spaces');
        expect(() =>
            setGitToken(projectId, admin, { token: 'ghp_secret123', username: 'a b' })
        ).toThrow('user name');
    });

    it('reaches the Git host as an Authorization header when pushing', async () => {
        // The host runs in its own process: a push blocks this one until git is done.
        const log = path.join(tempDir, 'headers.log');
        const host = spawn(process.execPath, [
            '-e',
            `const fs = require('fs');
             const s = require('http').createServer((req, res) => {
                 fs.appendFileSync(${JSON.stringify(log)}, (req.headers.authorization || '-') + '\\n');
                 res.statusCode = 404; res.end();
             });
             s.listen(0, '127.0.0.1', () => console.log(s.address().port));`
        ]);
        try {
            const port = await new Promise<string>((resolve, reject) => {
                host.stdout.once('data', d => resolve(String(d).trim()));
                host.once('error', reject);
            });
            await fs.writeFile(path.join(dir, 'a.json'), '{}');
            addAllAndCommit(dir, 'First', admin);
            setRemoteOrigin(dir, `http://127.0.0.1:${port}/client/site.git`);
            setGitToken(projectId, admin, { token: 'glpat-secret123', username: 'oauth2' });

            expect(push(dir)).toBe(false);
            const seen = (await fs.readFile(log, 'utf8')).split('\n');
            expect(seen).toContain(
                `Basic ${Buffer.from('oauth2:glpat-secret123').toString('base64')}`
            );
        } finally {
            host.kill();
        }
    });
});
