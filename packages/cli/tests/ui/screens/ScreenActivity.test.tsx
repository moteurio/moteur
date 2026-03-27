import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenActivity } from '../../../src/ui/screens/ScreenActivity.js';

describe('ScreenActivity', () => {
    it('shows recent activity title and CLI hint', () => {
        const { lastFrame } = render(<ScreenActivity />);
        const output = lastFrame();
        expect(output).toContain('Recent activity');
        expect(output).toContain('moteur activity list');
    });
});
