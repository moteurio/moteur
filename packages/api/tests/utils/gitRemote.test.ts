import { describe, expect, it } from 'vitest';
import { gitRemoteRefusal } from '../../src/utils/gitRemote.js';

describe('gitRemoteRefusal', () => {
    it('lets anyone use an https remote, or none', () => {
        expect(gitRemoteRefusal({ remoteUrl: 'https://github.com/a/b.git' })).toBeNull();
        expect(gitRemoteRefusal(undefined)).toBeNull();
        expect(gitRemoteRefusal({ remoteUrl: '  ' })).toBeNull();
    });

    it('refuses paths, file:// and SSH remotes, whoever asks: they could reach another project', () => {
        for (const remoteUrl of [
            '/data/projects/other',
            '../other',
            'file:///data/projects/other',
            'git@github.com:a/b.git',
            'ssh://git@github.com/a/b.git'
        ]) {
            expect(gitRemoteRefusal({ remoteUrl }), remoteUrl).toMatch(/https/);
        }
    });

    it('refuses a password or token in the address: project.json is committed', () => {
        for (const remoteUrl of [
            'https://ghp_secret@github.com/a/b.git',
            'https://x-access-token:ghp_secret@github.com/a/b.git'
        ])
            expect(gitRemoteRefusal({ remoteUrl }), remoteUrl).toMatch(/password or token/);
    });
});
