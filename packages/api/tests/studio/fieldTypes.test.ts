import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/middlewares/auth', () => ({
    requireAuth: (_req: any, _res: any, next: any) => next()
}));

vi.mock('@moteurio/core/registry/FieldRegistry.js', () => ({
    default: {
        all: () => ({
            'core/text': {
                type: 'core/text',
                label: 'Text',
                description: 'One line.',
                optionsSchema: { maxLength: { type: 'core/number', label: 'Max Length' } },
                validate: () => []
            },
            'core/id': { type: 'core/id', label: 'ID' }
        })
    }
}));

import router from '../../src/studio/fieldTypes';

const app = express();
app.use('/studio/field-types', router);

describe('GET /studio/field-types', () => {
    it('lists types with their options, without engine internals', async () => {
        const res = await request(app).get('/studio/field-types');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            types: [
                {
                    type: 'core/text',
                    label: 'Text',
                    description: 'One line.',
                    options: { maxLength: { type: 'core/number', label: 'Max Length' } }
                },
                { type: 'core/id', label: 'ID' }
            ]
        });
    });
});
