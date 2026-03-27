import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenTemplates } from '../../../src/ui/screens/ScreenTemplates.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenTemplates', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenTemplates loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });
    it('shows error', () => {
        const { lastFrame } = render(
            <ScreenTemplates loading={false} error="Error" listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Error');
    });
    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenTemplates loading={false} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('No items.');
        expect(lastFrame()).toContain('← Back');
    });
    it('shows list when items present', () => {
        const items = [{ id: 't1', label: 'Post' }];
        const { lastFrame } = render(
            <ScreenTemplates
                {...listProps}
                loading={false}
                error={null}
                listItems={items}
                filteredItems={items}
            />
        );
        expect(lastFrame()).toContain('Post');
    });
});
