import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    envServerSettings,
    legalLinks,
    linkableUrl,
    readServerSettings,
    updateServerSettings
} from '../src/serverSettings.js';

describe('server settings: where the Terms and Privacy policy are', () => {
    let root: string;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'moteur-settings-'));
        vi.stubEnv('AUTH_USERS_FILE', path.join(root, 'users.json'));
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('has none until the environment or an operator says', () => {
        expect(legalLinks()).toEqual({});
    });

    it('takes https addresses from the environment, and ignores the rest with one warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubEnv('MOTEUR_TERMS_URL', 'https://www.moteur.io/terms');
        vi.stubEnv('MOTEUR_PRIVACY_URL', 'ftp://example.test/privacy');
        expect(legalLinks()).toEqual({ terms: 'https://www.moteur.io/terms' });
        expect(envServerSettings()).toEqual({ termsUrl: 'https://www.moteur.io/terms' });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('MOTEUR_PRIVACY_URL');
    });

    it('lets a saved setting win over the environment, and null bring it back', () => {
        vi.stubEnv('MOTEUR_TERMS_URL', 'https://www.moteur.io/terms');
        updateServerSettings({
            termsUrl: 'https://legal.example.test/terms',
            privacyUrl: 'https://legal.example.test/privacy'
        });
        expect(legalLinks()).toEqual({
            terms: 'https://legal.example.test/terms',
            privacy: 'https://legal.example.test/privacy'
        });
        expect(fs.existsSync(path.join(root, 'server-settings.json'))).toBe(true);
        updateServerSettings({ termsUrl: null });
        expect(readServerSettings()).toEqual({ privacyUrl: 'https://legal.example.test/privacy' });
        expect(legalLinks().terms).toBe('https://www.moteur.io/terms');
    });

    it('refuses what a page can’t safely link to, and saves nothing', () => {
        for (const bad of ['javascript:alert(1)', '/terms', 'http://example.test/terms', ''])
            expect(() => updateServerSettings({ termsUrl: bad })).toThrow(
                expect.objectContaining({ status: 400, code: 'URL_INVALID' })
            );
        expect(readServerSettings()).toEqual({});
        expect(linkableUrl('http://localhost:5180/terms')).toBe(true);
    });
});
