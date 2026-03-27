import { describe, expect, it } from 'vitest';
import { sanitizeUploadFilename } from '../../src/assets/safeUploadFilename.js';

describe('sanitizeUploadFilename', () => {
    it('strips directories and keeps basename', () => {
        expect(sanitizeUploadFilename('../../../etc/passwd')).toBe('passwd');
    });

    it('replaces unsafe characters', () => {
        expect(sanitizeUploadFilename('my file (1).jpg')).toBe('my_file_1_.jpg');
    });

    it('falls back when empty', () => {
        expect(sanitizeUploadFilename('')).toBe('file');
        expect(sanitizeUploadFilename('...')).toBe('file');
    });
});
