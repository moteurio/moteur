import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenLayouts } from '../../../src/ui/screens/ScreenLayouts.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenLayouts', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenLayouts loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });
    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenLayouts loading={false} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('No items.');
        expect(lastFrame()).toContain('← Back');
    });
});
