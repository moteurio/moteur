import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { EmptyListState } from '../../src/ui/screens/EmptyListState.js';

describe('EmptyListState', () => {
    it('shows default message and back hint', () => {
        const { lastFrame } = render(<EmptyListState />);
        const output = lastFrame();
        expect(output).toContain('No items.');
        expect(output).toContain('← Back');
        expect(output).toContain('Esc');
    });

    it('shows custom message when provided', () => {
        const { lastFrame } = render(<EmptyListState message="No pages yet." />);
        const output = lastFrame();
        expect(output).toContain('No pages yet.');
        expect(output).toContain('← Back');
    });
});
