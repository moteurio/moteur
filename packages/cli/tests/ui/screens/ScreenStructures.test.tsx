import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenStructures } from '../../../src/ui/screens/ScreenStructures.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenStructures', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenStructures loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });
    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenStructures loading={false} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('No items.');
        expect(lastFrame()).toContain('← Back');
    });
});
