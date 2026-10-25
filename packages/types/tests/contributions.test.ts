import { describe, expect, it } from 'vitest';
import { capabilitiesFromContributions, mergeContributions } from '../src/Plugin.js';

describe('mergeContributions', () => {
    it('merges mounts and schema lists', () => {
        const merged = mergeContributions(
            { api: { mounts: ['/ai'] }, schemas: { fields: ['geo/location'] } },
            {
                api: { mounts: ['/ai', '/billing'], openApi: true },
                schemas: { blocks: ['geo/map'] }
            }
        );
        expect(merged.api?.mounts).toEqual(['/ai', '/billing']);
        expect(merged.api?.openApi).toBe(true);
        expect(merged.schemas?.fields).toEqual(['geo/location']);
        expect(merged.schemas?.blocks).toEqual(['geo/map']);
    });
});

describe('capabilitiesFromContributions', () => {
    it('mirrors routes, openapi and auth-provider', () => {
        expect(
            capabilitiesFromContributions({
                api: { mounts: ['/auth'], openApi: true },
                auth: { providers: ['github'] }
            })
        ).toEqual(['routes', 'openapi', 'auth-provider']);
    });
});
