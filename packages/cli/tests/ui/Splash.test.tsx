import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Splash } from '../../src/ui/Splash.js';

describe('Splash', () => {
    it('shows ASCII art, default version/tagline and Atelier subtitle', () => {
        const { lastFrame } = render(<Splash />);
        const output = lastFrame();
        expect(output).toContain('v0.1.0');
        expect(output).toContain('Structured Content Engine');
        expect(output).toContain('Atelier');
        expect(output).toContain('____');
    });

    it('shows custom version and tagline', () => {
        const { lastFrame } = render(<Splash version="1.0.0" tagline="Content API" />);
        const output = lastFrame();
        expect(output).toContain('v1.0.0');
        expect(output).toContain('Content API');
    });

    it('shows status when provided', () => {
        const { lastFrame } = render(<Splash status="Connecting to api.moteur.io…" />);
        const output = lastFrame();
        expect(output).toContain('Connecting to api.moteur.io');
    });
});
