import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenUserdata } from '../../../src/ui/screens/ScreenUserdata.js';

describe('ScreenUserdata', () => {
    it('shows user data title and CLI hint', () => {
        const { lastFrame } = render(<ScreenUserdata />);
        const output = lastFrame();
        expect(output).toContain('User data');
        expect(output).toContain('moteur userdata');
    });
});
