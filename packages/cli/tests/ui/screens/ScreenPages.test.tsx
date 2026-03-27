import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenPages } from '../../../src/ui/screens/ScreenPages.js';

const listProps = {
    filteredItems: [{ id: 'p1', label: 'Home' }],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenPages', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenPages loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });

    it('shows error message', () => {
        const { lastFrame } = render(
            <ScreenPages loading={false} error="Network error" listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Network error');
    });

    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenPages loading={false} error={null} listItems={[]} {...listProps} />
        );
        const output = lastFrame();
        expect(output).toContain('No items.');
        expect(output).toContain('← Back');
    });

    it('shows list when items present', () => {
        const { lastFrame } = render(
            <ScreenPages
                loading={false}
                error={null}
                listItems={[{ id: 'p1', label: 'Home' }]}
                {...listProps}
            />
        );
        expect(lastFrame()).toContain('Home');
    });
});
