import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenWebhooks } from '../../../src/ui/screens/ScreenWebhooks.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false
};

describe('ScreenWebhooks', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenWebhooks loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });
    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenWebhooks loading={false} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('No items.');
        expect(lastFrame()).toContain('← Back');
    });
});
