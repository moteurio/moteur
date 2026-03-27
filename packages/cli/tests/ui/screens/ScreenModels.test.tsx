import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenModels } from '../../../src/ui/screens/ScreenModels.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenModels', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenModels loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });

    it('shows error', () => {
        const { lastFrame } = render(
            <ScreenModels loading={false} error="Failed" listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Failed');
    });

    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenModels loading={false} error={null} listItems={[]} {...listProps} />
        );
        const output = lastFrame();
        expect(output).toContain('No items.');
        expect(output).toContain('← Back');
    });

    it('shows list when items present', () => {
        const items = [{ id: 'm1', label: 'Posts' }];
        const { lastFrame } = render(
            <ScreenModels
                {...listProps}
                loading={false}
                error={null}
                listItems={items}
                filteredItems={items}
            />
        );
        expect(lastFrame()).toContain('Posts');
    });
});
