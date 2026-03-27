import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Sidebar } from '../../src/ui/Sidebar.js';

describe('Sidebar', () => {
    it('shows MOTEUR title and main menu when level is main', () => {
        const { lastFrame } = render(<Sidebar level="main" menuIndex={0} focused={true} />);
        const output = lastFrame();
        expect(output).toContain('MOTEUR');
        expect(output).toContain('Content');
        expect(output).toContain('Schemas');
        expect(output).toContain('Projects');
        expect(output).toContain('Quit');
    });

    it('shows submenu when level is content', () => {
        const { lastFrame } = render(<Sidebar level="content" menuIndex={0} focused={false} />);
        const output = lastFrame();
        expect(output).toContain('Pages');
        expect(output).toContain('Entries');
        expect(output).toContain('Back');
    });

    it('shows selected item with cursor', () => {
        const { lastFrame } = render(<Sidebar level="main" menuIndex={1} focused={true} />);
        const output = lastFrame();
        expect(output).toContain('▸');
    });
});
