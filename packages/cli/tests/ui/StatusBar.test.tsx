import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { StatusBar } from '../../src/ui/StatusBar.js';

describe('StatusBar', () => {
    it('renders structured hints when hints prop provided', () => {
        const { lastFrame } = render(
            <StatusBar
                hints={[
                    { k: 'Esc', label: 'back' },
                    { k: 'Enter', label: 'open' }
                ]}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Esc');
        expect(output).toContain('back');
        expect(output).toContain('Enter');
        expect(output).toContain('open');
    });

    it('renders fallback hint string when hint prop provided', () => {
        const { lastFrame } = render(<StatusBar hint="Press any key to continue" />);
        const output = lastFrame();
        expect(output).toContain('Press any key to continue');
    });

    it('renders empty when no hints or hint', () => {
        const { lastFrame } = render(<StatusBar />);
        expect(lastFrame()).toBeDefined();
    });
});
