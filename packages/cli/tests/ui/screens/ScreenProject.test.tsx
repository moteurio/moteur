import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenProject } from '../../../src/ui/screens/ScreenProject.js';

describe('ScreenProject', () => {
    it('shows project label and id when no detail', () => {
        const { lastFrame } = render(
            <ScreenProject projectLabel="My Blog" projectId="my-blog" detail={null} />
        );
        const output = lastFrame();
        expect(output).toContain('My Blog');
        expect(output).toContain('ID:');
        expect(output).toContain('my-blog');
    });

    it('renders nothing when detail is set', () => {
        const { lastFrame } = render(
            <ScreenProject
                projectLabel="My Blog"
                projectId="my-blog"
                detail={{ id: 'x', label: 'X' }}
            />
        );
        expect(lastFrame()).toBe('');
    });
});
