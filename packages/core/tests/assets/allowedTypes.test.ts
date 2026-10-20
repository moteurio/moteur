import { describe, expect, it } from 'vitest';
import {
    getAssetTypeFromMime,
    isAllowedMime,
    resolveUploadMime
} from '../../src/assets/allowedTypes.js';

describe('3D model assets', () => {
    it('classifies glTF, glb and USDZ as models', () => {
        expect(getAssetTypeFromMime('model/gltf-binary')).toBe('model');
        expect(getAssetTypeFromMime('model/gltf+json')).toBe('model');
        expect(getAssetTypeFromMime('model/vnd.usdz+zip')).toBe('model');
    });

    it('respects a project that only allows some types', () => {
        expect(isAllowedMime('model/gltf-binary', ['image', 'model'])).toBe(true);
        expect(isAllowedMime('model/gltf-binary', ['image'])).toBe(false);
    });
});

describe('resolveUploadMime', () => {
    it('infers 3D types from the extension when the client sent a generic type', () => {
        expect(resolveUploadMime('application/octet-stream', 'robot.glb')).toBe(
            'model/gltf-binary'
        );
        expect(resolveUploadMime('', 'scene.GLTF')).toBe('model/gltf+json');
        expect(resolveUploadMime(undefined, 'chair.usdz')).toBe('model/vnd.usdz+zip');
    });

    it('keeps a specific type the client sent', () => {
        expect(resolveUploadMime('image/png', 'robot.glb')).toBe('image/png');
    });

    it('leaves unknown generic uploads alone, so they are still rejected', () => {
        expect(resolveUploadMime('application/octet-stream', 'tool.exe')).toBe(
            'application/octet-stream'
        );
        expect(isAllowedMime(resolveUploadMime('application/octet-stream', 'tool.exe'))).toBe(
            false
        );
    });
});
