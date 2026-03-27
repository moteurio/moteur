import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { LoadingSpinner } from '../../src/ui/LoadingSpinner.js';

describe('LoadingSpinner', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows default label with spinner', () => {
        const { lastFrame } = render(<LoadingSpinner />);
        const output = lastFrame();
        expect(output).toContain('Loading');
        expect(output.trim()).not.toBe('');
    });

    it('shows custom label', () => {
        const { lastFrame } = render(<LoadingSpinner label="Loading projects" />);
        const output = lastFrame();
        expect(output).toContain('Loading projects');
    });

    it('shows label after timer advance', () => {
        const { lastFrame, rerender } = render(<LoadingSpinner label="Load" />);
        expect(lastFrame()).toContain('Load');
        vi.advanceTimersByTime(500);
        rerender(<LoadingSpinner label="Load" />);
        expect(lastFrame()).toContain('Load');
    });
});
