import { describe, expect, it } from 'vitest';
import { scheduleKey, entryKey, submissionKey } from '../src/utils/storageKeys.js';
import { pageFilePath, scheduleFilePath } from '../src/utils/pathUtils.js';

describe('ids in paths', () => {
    it('refuses ids that would leave their folder', () => {
        for (const bad of ['../secrets', '..', 'a/b', 'a\\b', '', '.moteur', 'x.json']) {
            expect(() => scheduleKey(bad)).toThrow(/Invalid id/);
            expect(() => scheduleFilePath('p', bad)).toThrow(/Invalid id/);
            expect(() => pageFilePath('p', bad)).toThrow(/Invalid id/);
            expect(() => entryKey('article', bad)).toThrow(/Invalid id/);
            expect(() => submissionKey(bad, 's1')).toThrow(/Invalid id/);
        }
    });

    it('answers 400, and keeps ordinary ids', () => {
        try {
            scheduleKey('../secrets');
        } catch (err) {
            expect((err as { statusCode?: number }).statusCode).toBe(400);
        }
        expect(scheduleKey('sch_1-a')).toBe('.moteur/schedules/sch_1-a.json');
    });
});

describe('stored file names', async () => {
    const { nameForType } = await import('../src/assets/allowedTypes.js');
    it('take the extension of the type the file was accepted as', () => {
        expect(nameForType('page.html', 'application/pdf')).toBe('page.pdf');
        expect(nameForType('photo.JPEG', 'image/jpeg')).toBe('photo.JPEG');
        expect(nameForType('noext', 'image/png')).toBe('noext.png');
        expect(nameForType('.html', 'image/png')).toBe('.html.png');
    });
});
