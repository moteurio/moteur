import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { KeyHint, KeyHints } from '../../src/ui/KeyHint.js';

describe('KeyHint', () => {
    it('renders key and label', () => {
        const { lastFrame } = render(<KeyHint k="Enter" label="open" />);
        const output = lastFrame();
        expect(output).toContain('Enter');
        expect(output).toContain('open');
    });

    it('renders Esc and back', () => {
        const { lastFrame } = render(<KeyHint k="Esc" label="back" />);
        const output = lastFrame();
        expect(output).toContain('Esc');
        expect(output).toContain('back');
    });
});

describe('KeyHints', () => {
    it('renders multiple key/label pairs', () => {
        const { lastFrame } = render(
            <KeyHints
                hints={[
                    { k: '↑↓', label: 'navigate' },
                    { k: 'Enter', label: 'open' },
                    { k: 'Esc', label: 'back' }
                ]}
            />
        );
        const output = lastFrame();
        expect(output).toContain('↑↓');
        expect(output).toContain('navigate');
        expect(output).toContain('Enter');
        expect(output).toContain('open');
        expect(output).toContain('Esc');
        expect(output).toContain('back');
    });

    it('renders single hint', () => {
        const { lastFrame } = render(<KeyHints hints={[{ k: 'q', label: 'quit' }]} />);
        const output = lastFrame();
        expect(output).toContain('q');
        expect(output).toContain('quit');
    });
});
