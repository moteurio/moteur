import { describe, it, expect } from 'vitest';
import { baseSpec } from '../src/openapi';

describe('openapi base spec', () => {
    it('defines the expected base document structure', () => {
        expect(baseSpec).toHaveProperty('openapi', '3.0.0');
        expect(baseSpec).toHaveProperty('info.title', 'Moteur API');
        expect(baseSpec).toHaveProperty('components.securitySchemes.bearerAuth');
        expect(baseSpec).toHaveProperty('components.securitySchemes.apiKeyAuth');
    });

    it('documents GET /health as unauthenticated with JSON 200 schema', () => {
        const health = baseSpec.paths?.['/health'];
        expect(health?.get).toBeDefined();
        expect(health?.get?.security).toEqual([]);
        const ok = health?.get?.responses?.['200'];
        expect(ok && 'content' in ok && ok.content?.['application/json']?.schema).toBeTruthy();
    });
});
