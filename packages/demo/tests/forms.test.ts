import { describe, expect, it } from 'vitest';
import { checkStudioForm } from '@moteurio/types';
import { models } from '../src/journal/schema.js';

describe('demo model forms', () => {
    it('every form the demo ships checks clean against its model', () => {
        const withForms = models.filter(m => m.studio?.form);
        expect(withForms.map(m => m.id)).toEqual(['article', 'event']);
        for (const m of withForms) expect(checkStudioForm(m.studio!.form, m.fields)).toEqual([]);
    });
});
