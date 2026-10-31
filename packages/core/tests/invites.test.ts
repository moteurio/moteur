import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    consumeInvite,
    createInvite,
    findInviteByToken,
    listInvites,
    liveInviteFor,
    renewInvite,
    revokeInvite
} from '../src/invites';

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-invites-'));
    vi.stubEnv('AUTH_USERS_FILE', path.join(dir, 'users.json'));
});
afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
});

const invite = (email = 'Louise@Atelier.example', roles = ['reviewer']) =>
    createInvite({ projectId: 'p1', email, roles, invitedBy: 'u-admin' });

describe('project invites', () => {
    it('stores a hash, not the token, and finds the invite by its token', () => {
        const { invite: made, token } = invite();
        expect(made.email).toBe('louise@atelier.example');
        expect(fs.readFileSync(path.join(dir, 'invites.json'), 'utf-8')).not.toContain(token);
        expect(findInviteByToken(token)?.id).toBe(made.id);
        expect(findInviteByToken('not-a-real-token-at-all')).toBeNull();
    });

    it('keeps known roles only, Writer when none', () => {
        expect(invite('a@x.io', ['translator', 'owner']).invite.roles).toEqual(['translator']);
        expect(invite('b@x.io', ['owner']).invite.roles).toEqual(['writer']);
    });

    it('rejects an address that is not one', () => {
        expect(() => invite('louise')).toThrow('A valid email is required');
    });

    it('replaces a pending invite to the same address', () => {
        const first = invite();
        const second = invite('louise@atelier.example', ['writer']);
        expect(listInvites('p1').map(i => i.id)).toEqual([second.invite.id]);
        expect(findInviteByToken(first.token)).toBeNull();
    });

    it('renews with a new link, the old one stops working', () => {
        const { invite: made, token } = invite();
        const renewed = renewInvite('p1', made.id)!;
        expect(renewed.token).not.toBe(token);
        expect(findInviteByToken(token)).toBeNull();
        expect(findInviteByToken(renewed.token)?.id).toBe(made.id);
        expect(renewInvite('p2', made.id)).toBeNull();
    });

    it('expires after a week', () => {
        vi.useFakeTimers();
        const { token } = invite();
        vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
        expect(findInviteByToken(token)).toBeNull();
        expect(listInvites('p1')).toEqual([]);
    });

    it('keeps the inviter’s note through a resend, and finds the newest invite for an address', () => {
        const { invite: made } = createInvite({
            projectId: 'p1',
            email: 'marc@x.io',
            roles: [],
            invitedBy: 'u-admin',
            note: 'Hi Marc'
        });
        expect(renewInvite('p1', made.id)!.invite.note).toBe('Hi Marc');
        expect(invite('a@x.io').invite.note).toBeUndefined();
        expect(liveInviteFor('Marc@X.io')?.id).toBe(made.id);
        expect(liveInviteFor('nobody@x.io')).toBeUndefined();
    });

    it('revokes and consumes', () => {
        const a = invite('a@x.io');
        const b = invite('b@x.io');
        expect(revokeInvite('p2', a.invite.id)).toBe(false);
        expect(revokeInvite('p1', a.invite.id)).toBe(true);
        consumeInvite(b.invite.id);
        expect(listInvites('p1')).toEqual([]);
        expect(findInviteByToken(b.token)).toBeNull();
    });
});
