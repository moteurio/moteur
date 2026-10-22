import { describe, expect, it } from 'vitest';
import { getAssetTypeFromMime, resolveUploadMime } from '../../src/assets/allowedTypes.js';
import { validateAudioField } from '../../src/validators/fields/core/validateAudioField.js';
import { assertPublicHttpsUrl } from '../../src/webhooks/webhookService.js';

describe('audio files', () => {
    it('are a kind of asset', () => {
        expect(getAssetTypeFromMime('audio/mpeg')).toBe('audio');
        expect(getAssetTypeFromMime('audio/wav')).toBe('audio');
        expect(resolveUploadMime('application/octet-stream', 'take-1.mp3')).toBe('audio/mpeg');
        expect(resolveUploadMime('', 'interview.m4a')).toBe('audio/mp4');
    });

    it('are checked as an audio field value', () => {
        const field = { type: 'core/audio' } as any;
        expect(validateAudioField(undefined, field, 'narration')).toEqual([]);
        expect(validateAudioField({ src: '/a.mp3' }, field, 'narration')).toEqual([]);
        expect(validateAudioField({ assetId: 'a1' }, field, 'narration')).toEqual([]);
        expect(validateAudioField({ title: 'x' }, field, 'narration')[0].code).toBe(
            'AUDIO_MISSING_SRC'
        );
        expect(validateAudioField('a.mp3', field, 'narration')[0].code).toBe('AUDIO_INVALID_TYPE');
    });
});

describe('assertPublicHttpsUrl', () => {
    it('refuses anything but HTTPS', async () => {
        await expect(assertPublicHttpsUrl('http://example.com/a.glb')).rejects.toThrow(/HTTPS/);
        await expect(assertPublicHttpsUrl('file:///etc/passwd')).rejects.toThrow(/HTTPS/);
        await expect(assertPublicHttpsUrl('not a url')).rejects.toThrow(/not a valid/);
    });

    it('refuses private and metadata addresses', async () => {
        await expect(assertPublicHttpsUrl('https://127.0.0.1/a')).rejects.toThrow(/private/);
        await expect(assertPublicHttpsUrl('https://169.254.169.254/latest')).rejects.toThrow(
            /private/
        );
        await expect(assertPublicHttpsUrl('https://[::1]/a')).rejects.toThrow(/private/);
        await expect(assertPublicHttpsUrl('https://10.0.0.8/a', 'Model URL')).rejects.toThrow(
            /^Model URL resolves/
        );
    });
});
