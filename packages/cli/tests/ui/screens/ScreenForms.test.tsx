import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenForms } from '../../../src/ui/screens/ScreenForms.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenForms', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenForms loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });
    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenForms loading={false} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('No items.');
        expect(lastFrame()).toContain('← Back');
    });
});
