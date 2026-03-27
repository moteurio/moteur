import { describe, it, expect } from 'vitest';
import { AIError, NotImplementedError } from '../src/errors.js';

describe('errors', () => {
    it('builds message and metadata for insufficient credits', () => {
        const err = new AIError('insufficient_credits', { required: 5, remaining: 2 });
        expect(err.name).toBe('AIError');
        expect(err.code).toBe('insufficient_credits');
        expect(err.details).toEqual({ required: 5, remaining: 2 });
        expect(err.message).toContain('required: 5');
        expect(err.message).toContain('remaining: 2');
    });

    it('uses provider configuration message for image provider errors', () => {
        const err = new AIError('image_provider_not_configured');
        expect(err.message).toContain('Image provider is not configured');
    });

    it('creates named not-implemented errors with default and custom messages', () => {
        const defaultErr = new NotImplementedError();
        expect(defaultErr.name).toBe('NotImplementedError');
        expect(defaultErr.message).toBe('This operation is not implemented.');

        const customErr = new NotImplementedError('No image generation support');
        expect(customErr.message).toBe('No image generation support');
    });
});
