import { describe, it, expect } from 'vitest';
import fieldRegistry from '../../src/registry/FieldRegistry.js';

// Ensure all fields (including core/textarea) are registered
import '../../src/fields/index.js';

describe('core/textarea field', () => {
    it('is registered in the field registry', () => {
        expect(fieldRegistry.has('core/textarea')).toBe(true);
        const schema = fieldRegistry.get('core/textarea');
        expect(schema.type).toBe('core/textarea');
        expect(schema.label).toBe('Textarea');
        expect(schema.validate).toBeDefined();
    });
});
