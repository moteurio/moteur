import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Toast } from '../../src/ui/Toast.js';

describe('Toast', () => {
    it('renders info message with dot icon by default', () => {
        const { lastFrame } = render(<Toast message="Something happened." />);
        const output = lastFrame();
        expect(output).toContain('Something happened.');
        expect(output).toContain('·');
    });

    it('renders success message with checkmark', () => {
        const { lastFrame } = render(<Toast message="Saved." type="success" />);
        const output = lastFrame();
        expect(output).toContain('Saved.');
        expect(output).toContain('✓');
    });

    it('renders error message with cross', () => {
        const { lastFrame } = render(<Toast message="Failed to save." type="error" />);
        const output = lastFrame();
        expect(output).toContain('Failed to save.');
        expect(output).toContain('✗');
    });
});
