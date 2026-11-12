import { describe, expect, it } from 'vitest';
import type { OpenAPIV3 } from 'openapi-types';
import { mergePathSpecs } from '../../src/utils/mergePathSpecs';

const projectId: OpenAPIV3.ParameterObject = {
    name: 'projectId',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const id: OpenAPIV3.ParameterObject = {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string' }
};
const ok = { responses: { '204': { description: 'Done' } } };

describe('mergePathSpecs', () => {
    it('keeps the operations of every module that documents a path', () => {
        const merged = mergePathSpecs({ '/a': { get: ok } }, { '/a': { post: ok } });
        expect(Object.keys(merged['/a'])).toEqual(['get', 'post']);
    });

    it('keeps path-level parameters', () => {
        const merged = mergePathSpecs({
            '/p/{projectId}/x/{id}': { parameters: [projectId, id], get: ok }
        });
        expect(merged['/p/{projectId}/x/{id}'].parameters).toEqual([projectId, id]);
    });

    it('lists a parameter once when two modules declare it on the same path', () => {
        const merged = mergePathSpecs(
            { '/p/{projectId}': { parameters: [projectId], get: ok } },
            { '/p/{projectId}': { parameters: [projectId], delete: ok } }
        );
        expect(merged['/p/{projectId}'].parameters).toEqual([projectId]);
    });
});
