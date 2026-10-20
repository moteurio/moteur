import { describe, expect, it } from 'vitest';
import { gitRemoteRefusal } from '../../src/utils/gitRemote.js';

const customer = { id: 'c1', email: 'c@x.com', roles: ['writer'], isActive: true } as any;
const operator = { ...customer, roles: ['admin'] };

describe('gitRemoteRefusal', () => {
    it('lets anyone use an https remote, or none', () => {
        expect(gitRemoteRefusal({ remoteUrl: 'https://github.com/a/b.git' }, customer)).toBeNull();
        expect(gitRemoteRefusal(undefined, customer)).toBeNull();
        expect(gitRemoteRefusal({ remoteUrl: '  ' }, customer)).toBeNull();
    });

    it('keeps paths, file:// and SSH remotes for operators', () => {
        for (const remoteUrl of [
            '/data/projects/other',
            '../other',
            'file:///data/projects/other',
            'git@github.com:a/b.git',
            'ssh://git@github.com/a/b.git'
        ]) {
            expect(gitRemoteRefusal({ remoteUrl }, customer), remoteUrl).toMatch(/https/);
            expect(gitRemoteRefusal({ remoteUrl }, operator), remoteUrl).toBeNull();
        }
    });
});
