import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { loginUser, verifyJWT } from '../../src/auth.js';
import { disconnectProvider } from '../../src/accountConnections.js';
import {
    beginPasskeyRegistration,
    beginPasskeySignIn,
    deviceFromUserAgent,
    finishPasskeyRegistration,
    finishPasskeySignIn,
    listPasskeys,
    readPasskeySettings,
    removePasskey,
    renamePasskey
} from '../../src/passkeys.js';
import { totpCode, totpStep } from '../../src/totp.js';
import { beginTwoFactor, enableTwoFactor } from '../../src/twoFactor.js';
import { getUserById, reloadUsers, withoutSecrets } from '../../src/users.js';
import { onEvent } from '../../src/utils/eventBus.js';
import { SoftAuthenticator } from '../helpers/softAuthenticator.js';

const password = 'a long password';
const SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('passkey settings', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('works on any localhost port on a developer’s machine', () => {
        vi.stubEnv('STUDIO_URL', '');
        vi.stubEnv('NODE_ENV', 'development');
        expect(readPasskeySettings()).toEqual({
            settings: { rpID: 'localhost', rpName: 'Moteur', origins: [], anyLocalhostPort: true }
        });
    });

    it('follows STUDIO_URL, and can be told otherwise', () => {
        vi.stubEnv('STUDIO_URL', 'https://studio.example.com/');
        expect(readPasskeySettings()).toMatchObject({
            settings: { rpID: 'studio.example.com', origins: ['https://studio.example.com'] }
        });
        vi.stubEnv('MOTEUR_PASSKEY_RP_ID', 'example.com');
        vi.stubEnv(
            'MOTEUR_PASSKEY_ORIGINS',
            'https://studio.example.com, https://admin.example.com'
        );
        vi.stubEnv('MOTEUR_PASSKEY_RP_NAME', 'Example CMS');
        expect(readPasskeySettings()).toEqual({
            settings: {
                rpID: 'example.com',
                rpName: 'Example CMS',
                origins: ['https://studio.example.com', 'https://admin.example.com'],
                anyLocalhostPort: false
            }
        });
    });

    it.each([
        ['production without an address', { NODE_ENV: 'production', STUDIO_URL: '' }, 'STUDIO_URL'],
        ['plain http outside localhost', { STUDIO_URL: 'http://studio.example.com' }, 'https'],
        ['an IP address', { STUDIO_URL: 'https://10.0.0.2' }, 'IP'],
        [
            'an origin off the RP ID',
            { STUDIO_URL: 'https://studio.example.com', MOTEUR_PASSKEY_RP_ID: 'other.com' },
            'not on other.com'
        ]
    ])('is off with %s', (_, env, problem) => {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
        expect(readPasskeySettings()).toEqual({ problem: expect.stringContaining(problem) });
    });

    it('turns off with MOTEUR_PASSKEYS=off', () => {
        vi.stubEnv('MOTEUR_PASSKEYS', 'off');
        expect(readPasskeySettings()).toBeNull();
    });

    it('names the device a passkey was made on', () => {
        expect(deviceFromUserAgent(SAFARI)).toBe('Safari on macOS');
        expect(
            deviceFromUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
            )
        ).toBe('Edge on Windows');
        expect(deviceFromUserAgent(undefined)).toBeUndefined();
    });
});

describe('passkeys', () => {
    let root: string;
    let device: SoftAuthenticator;
    const users = () => JSON.parse(fs.readFileSync(path.join(root, 'users.json'), 'utf8'));

    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-passkeys-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
        vi.stubEnv('DATA_ROOT', root);
        vi.stubEnv('JWT_SECRET', 'passkey-test');
        vi.stubEnv('MOTEUR_ENCRYPTION_KEY', 'c'.repeat(64));
        vi.stubEnv('STUDIO_URL', 'http://localhost:5180');
        vi.stubEnv('MOTEUR_EMAIL_CODES_TO_LOG', '1');
        const base = { isActive: true, roles: [], projects: [] };
        fs.writeFileSync(
            path.join(root, 'users.json'),
            JSON.stringify([
                {
                    ...base,
                    id: 'u1',
                    email: 'louise@journal.test',
                    name: 'Louise',
                    passwordHash: await bcrypt.hash(password, 4)
                },
                { ...base, id: 'u2', email: 'marc@journal.test', name: 'Marc' }
            ])
        );
        reloadUsers();
        device = new SoftAuthenticator();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        reloadUsers();
        fs.rmSync(root, { recursive: true, force: true });
    });

    async function addPasskey(userId = 'u1', on = device, name?: string) {
        const options = await beginPasskeyRegistration(userId);
        return finishPasskeyRegistration(userId, on.create(options), { name, userAgent: SAFARI });
    }

    it('adds a passkey and lists it, without what the server keeps', async () => {
        const options = await beginPasskeyRegistration('u1');
        expect(options).toMatchObject({
            rp: { id: 'localhost', name: 'Moteur' },
            user: { name: 'louise@journal.test', displayName: 'Louise' },
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
            attestation: 'none'
        });
        // The handle passkeys know the account by is random, not the account id.
        expect(Buffer.from(options.user.id, 'base64url').toString()).not.toContain('u1');
        const added = await finishPasskeyRegistration('u1', device.create(options), {
            userAgent: SAFARI
        });
        expect(added).toMatchObject({
            name: 'iCloud Keychain',
            provider: 'iCloud Keychain',
            synced: true,
            deviceType: 'multiDevice',
            createdOn: 'Safari on macOS',
            transports: ['internal', 'hybrid']
        });
        expect(listPasskeys('u1')).toEqual([added]);
        expect(users()[0].passkeys[0]).toMatchObject({
            id: added.id,
            publicKey: expect.any(String),
            counter: 0
        });
        reloadUsers();
        const safe = withoutSecrets(getUserById('u1')!);
        expect(safe).not.toHaveProperty('passkeyUserId');
        expect(safe.passkeys).toBe(1);

        // The next one tells the browser which it holds already.
        const next = await beginPasskeyRegistration('u1');
        expect(next.excludeCredentials).toEqual([
            expect.objectContaining({ id: added.id, transports: ['internal', 'hybrid'] })
        ]);
    });

    it('names a passkey as asked, and a security key by its device', async () => {
        const key = new SoftAuthenticator({
            synced: false,
            aaguid: '00000000-0000-0000-0000-000000000000'
        });
        const named = await addPasskey('u1', key);
        expect(named).toMatchObject({ name: 'Safari on macOS', synced: false });
        expect(named).not.toHaveProperty('provider');
        const asked = await addPasskey('u1', device, '  Work   laptop ');
        expect(asked.name).toBe('Work laptop');
    });

    it('takes a challenge once, for its own account and purpose', async () => {
        const options = await beginPasskeyRegistration('u1');
        const answer = device.create(options);
        await expect(finishPasskeyRegistration('u2', answer)).rejects.toMatchObject({
            code: 'PASSKEY_EXPIRED'
        });
        // Spent by the refused try, too.
        await expect(finishPasskeyRegistration('u1', answer)).rejects.toMatchObject({
            code: 'PASSKEY_EXPIRED'
        });
        const signIn = await beginPasskeySignIn();
        await expect(
            finishPasskeyRegistration(
                'u1',
                device.create({ ...options, challenge: signIn.challenge })
            )
        ).rejects.toMatchObject({ code: 'PASSKEY_EXPIRED' });
    });

    it('lets a challenge expire after five minutes', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const options = await beginPasskeyRegistration('u1');
        vi.advanceTimersByTime(5 * 60_000 + 1);
        await expect(finishPasskeyRegistration('u1', device.create(options))).rejects.toMatchObject(
            { code: 'PASSKEY_EXPIRED' }
        );
    });

    it('refuses a device that didn’t check the person, and other pages', async () => {
        device.verifiesUser = false;
        await expect(addPasskey()).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
        device.verifiesUser = true;
        device.origin = 'https://evil.example';
        await expect(addPasskey()).rejects.toMatchObject({ code: 'PASSKEY_ORIGIN' });
        device.origin = 'http://localhost:9999';
        await expect(addPasskey()).rejects.toMatchObject({ code: 'PASSKEY_ORIGIN' });
        expect(listPasskeys('u1')).toEqual([]);
    });

    it('signs in with no address, and needs no app code after', async () => {
        const { secret } = await beginTwoFactor('u1');
        await enableTwoFactor('u1', totpCode(secret, totpStep()));
        const added = await addPasskey();
        const used = vi.fn();
        onEvent('auth.passkey.used', used);

        const options = await beginPasskeySignIn();
        expect(options).toMatchObject({ rpId: 'localhost', userVerification: 'required' });
        expect(options.allowCredentials ?? []).toEqual([]);
        const result = await finishPasskeySignIn(device.get(options));
        expect(verifyJWT(result.token).sub).toBe('u1');
        expect(result.user).not.toHaveProperty('passwordHash');
        expect(result.passkeyId).toBe(added.id);
        expect(used).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'u1', passkeyId: added.id })
        );
        reloadUsers();
        expect(getUserById('u1')?.lastLoginAt).toBeTruthy();
        expect(listPasskeys('u1')[0].lastUsedAt).toBeTruthy();

        // The same answer twice is refused.
        await expect(finishPasskeySignIn(device.get(options))).rejects.toMatchObject({
            code: 'PASSKEY_EXPIRED'
        });
    });

    it('stands in for the app code after a password', async () => {
        const { secret } = await beginTwoFactor('u1');
        await enableTwoFactor('u1', totpCode(secret, totpStep()));
        const added = await addPasskey();
        const first = await loginUser('louise@journal.test', password);
        if (!('twoFactor' in first)) throw new Error('expected a ticket');
        const options = await beginPasskeySignIn({ ticket: first.twoFactor.ticket });
        expect(options.allowCredentials).toEqual([
            expect.objectContaining({ id: added.id, type: 'public-key' })
        ]);
        const result = await finishPasskeySignIn(device.get(options));
        expect(verifyJWT(result.token).sub).toBe('u1');
        await expect(beginPasskeySignIn({ ticket: 'forged' })).rejects.toMatchObject({
            code: 'TWO_FACTOR_EXPIRED'
        });
    });

    it('with an address, takes only that account’s passkey, and tells nothing about the address', async () => {
        await addPasskey('u1');
        const marc = new SoftAuthenticator();
        await addPasskey('u2', marc);

        const known = await beginPasskeySignIn({ email: 'Louise@Journal.test' });
        const unknown = await beginPasskeySignIn({ email: 'nobody@journal.test' });
        expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
        expect(known.allowCredentials ?? []).toEqual([]);

        await expect(finishPasskeySignIn(marc.get(known))).rejects.toMatchObject({
            code: 'PASSKEY_WRONG_ACCOUNT'
        });
        await expect(finishPasskeySignIn(device.get(unknown))).rejects.toMatchObject({
            code: 'PASSKEY_WRONG_ACCOUNT'
        });
        const again = await beginPasskeySignIn({ email: 'louise@journal.test' });
        expect(verifyJWT((await finishPasskeySignIn(device.get(again))).token).sub).toBe('u1');
    });

    it('says which passkey it doesn’t know, so the browser can forget it', async () => {
        const added = await addPasskey();
        await removePasskey('u1', added.id);
        const options = await beginPasskeySignIn();
        await expect(finishPasskeySignIn(device.get(options))).rejects.toMatchObject({
            status: 401,
            code: 'PASSKEY_UNKNOWN',
            credentialId: added.id,
            rpId: 'localhost'
        });
    });

    it('refuses a signature that doesn’t match, or one from a device that didn’t check the person', async () => {
        await addPasskey();
        const answer = device.get(await beginPasskeySignIn());
        const signature = Buffer.from(answer.response.signature, 'base64url');
        signature[signature.length - 1] ^= 1;
        answer.response.signature = signature.toString('base64url');
        await expect(finishPasskeySignIn(answer)).rejects.toMatchObject({
            code: 'PASSKEY_INVALID'
        });
        device.verifiesUser = false;
        await expect(
            finishPasskeySignIn(device.get(await beginPasskeySignIn()))
        ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
    });

    it('refuses a copied security key whose counter went back', async () => {
        const key = new SoftAuthenticator({ synced: false });
        await addPasskey('u1', key);
        await finishPasskeySignIn(key.get(await beginPasskeySignIn()));
        key.credentials[0].counter = 0;
        await expect(
            finishPasskeySignIn(key.get(await beginPasskeySignIn()))
        ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
    });

    it('refuses a turned-off account, after checking the passkey', async () => {
        await addPasskey();
        const all = users();
        all[0].isActive = false;
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify(all));
        reloadUsers();
        await expect(
            finishPasskeySignIn(device.get(await beginPasskeySignIn()))
        ).rejects.toMatchObject({ status: 403 });
    });

    it('renames a passkey', async () => {
        const added = await addPasskey();
        expect((await renamePasskey('u1', added.id, 'Phone')).name).toBe('Phone');
        await expect(renamePasskey('u1', added.id, '   ')).rejects.toMatchObject({ status: 400 });
        await expect(renamePasskey('u1', 'nope', 'Phone')).rejects.toMatchObject({ status: 404 });
        await expect(renamePasskey('u2', added.id, 'Mine')).rejects.toMatchObject({ status: 404 });
        expect((await renamePasskey('u1', added.id, 'x'.repeat(80))).name).toHaveLength(60);
    });

    it('removing one ends sessions; the last goes only when an email code can still sign in', async () => {
        const marc = new SoftAuthenticator();
        const added = await addPasskey('u2', marc);
        const session = (await finishPasskeySignIn(marc.get(await beginPasskeySignIn()))).token;

        vi.stubEnv('MOTEUR_EMAIL_SIGNIN', 'off');
        await expect(removePasskey('u2', added.id)).rejects.toMatchObject({
            status: 409,
            code: 'LAST_SIGN_IN_METHOD'
        });
        vi.stubEnv('MOTEUR_EMAIL_SIGNIN', '');
        const removed = vi.fn();
        onEvent('auth.passkey.removed', removed);
        const updated = await removePasskey('u2', added.id);
        expect(updated.passkeys).toBeUndefined();
        expect(updated.authVersion).toBe(1);
        expect(() => verifyJWT(session)).toThrow('revoked');
        expect(removed).toHaveBeenCalled();
        await expect(removePasskey('u2', added.id)).rejects.toMatchObject({ status: 404 });
    });

    it('lets the last provider go when a passkey still signs in', async () => {
        const all = users();
        all[1].auth = { googleSub: 'subject' };
        fs.writeFileSync(path.join(root, 'users.json'), JSON.stringify(all));
        reloadUsers();
        const marc = new SoftAuthenticator();
        await addPasskey('u2', marc);
        await expect(disconnectProvider('u2', 'google')).resolves.toMatchObject({ id: 'u2' });
    });

    it('keeps one passkey on one account only', async () => {
        const options = await beginPasskeyRegistration('u1');
        const answer = device.create(options);
        await finishPasskeyRegistration('u1', answer);
        // The same credential answered again for another account (a browser bug, or a replay).
        const other = await beginPasskeyRegistration('u2');
        const replay = JSON.parse(
            Buffer.from(answer.response.clientDataJSON, 'base64url').toString()
        );
        replay.challenge = other.challenge;
        await expect(
            finishPasskeyRegistration('u2', {
                ...answer,
                response: {
                    ...answer.response,
                    clientDataJSON: Buffer.from(JSON.stringify(replay)).toString('base64url')
                }
            })
        ).rejects.toMatchObject({ status: 409, code: 'PASSKEY_EXISTS' });
    });
});
