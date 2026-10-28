import { afterEach, describe, expect, it, vi } from 'vitest';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ default: { lookup } }));
import { validateUrl, resolveWebhookTarget } from '../../src/webhooks/networkPolicy.js';

describe('outbound address policy', () => {
    afterEach(() => vi.unstubAllEnvs());
    it.each([
        '127.0.0.1',
        '0.0.0.0',
        '10.0.0.1',
        '169.254.169.254',
        '224.0.0.1',
        '[::1]',
        '[::]',
        '[::ffff:7f00:1]',
        '[fc00::1]'
    ])('rejects restricted literal %s', async host => {
        vi.stubEnv('NODE_ENV', 'production');
        await expect(validateUrl(`https://${host}/hook`)).rejects.toThrow('restricted');
    });
    it('rejects a hostname with a private answer among public answers', async () => {
        lookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.1', family: 4 }
        ]);
        await expect(resolveWebhookTarget(new URL('https://receiver.test'))).rejects.toThrow(
            'restricted'
        );
    });
    it('returns the checked address for a connection', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        expect(await resolveWebhookTarget(new URL('https://receiver.test'))).toEqual({
            address: '93.184.216.34',
            family: 4
        });
    });
    it('allows HTTP localhost only when asked for, outside production', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        await expect(validateUrl('http://127.0.0.1/hook')).rejects.toThrow('HTTPS');
        vi.stubEnv('NODE_ENV', '');
        vi.stubEnv('MOTEUR_ALLOW_LOOPBACK_URLS', '1');
        await expect(validateUrl('http://127.0.0.1/hook')).resolves.toMatchObject({
            address: '127.0.0.1',
            family: 4
        });
        vi.stubEnv('NODE_ENV', 'production');
        await expect(validateUrl('http://127.0.0.1/hook')).rejects.toThrow('HTTPS');
    });
});
