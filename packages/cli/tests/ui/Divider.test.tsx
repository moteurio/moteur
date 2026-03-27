import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Divider } from '../../src/ui/Divider.js';

describe('Divider', () => {
    it('renders default line of 40 dashes', () => {
        const { lastFrame } = render(<Divider />);
        const output = lastFrame();
        expect(output).toContain('─'.repeat(40));
    });

    it('renders custom character and length', () => {
        const { lastFrame } = render(<Divider character="-" length={5} />);
        const output = lastFrame();
        expect(output).toContain('-----');
    });
});
