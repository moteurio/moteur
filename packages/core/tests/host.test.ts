import { describe, expect, it } from 'vitest';
import * as host from '../src/host.js';

// Plugins in other repos import these: removing or renaming one breaks them at runtime.
const CONTRACT = [
    'appendAiAuditEvent',
    'assertPublicHttpsUrl',
    'createEntry',
    'creditBalance',
    'fieldRegistry',
    'getAsset',
    'getEntryForProject',
    'getModelSchema',
    'getProject',
    'getProjectById',
    'getProjectJson',
    'getUserById',
    'grantCredits',
    'listProjectKeys',
    'loginWithProvider',
    'PROJECT_KEY',
    'putProjectJson',
    'resolveOnlinePresenceMaxIdleMs',
    'setOnlineUserIdsProvider',
    'spendCredits',
    'updateAsset',
    'updateEntry',
    'updateProject',
    'uploadAsset',
    'verifyJWT'
];

describe('the plugin host surface', () => {
    it('keeps every name plugins use', () => {
        for (const name of CONTRACT) expect(host, name).toHaveProperty(name);
        expect(Object.keys(host).sort()).toEqual([...CONTRACT].sort());
    });
});
