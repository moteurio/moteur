import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ScreenEntries } from '../../../src/ui/screens/ScreenEntries.js';

const listProps = {
    filteredItems: [] as { id: string; label: string }[],
    listCursor: 0,
    filter: '',
    selectedIds: new Set<string>(),
    detail: null,
    hasMore: false,
    confirmDeleteId: null as string | null,
    bulkConfirm: null as 'delete' | null,
    showBulkMenu: false
};

describe('ScreenEntries', () => {
    it('shows loading state', () => {
        const { lastFrame } = render(
            <ScreenEntries loading={true} error={null} listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Loading');
    });

    it('shows error', () => {
        const { lastFrame } = render(
            <ScreenEntries loading={false} error="Error" listItems={[]} {...listProps} />
        );
        expect(lastFrame()).toContain('Error');
    });

    it('shows empty state with back hint', () => {
        const { lastFrame } = render(
            <ScreenEntries loading={false} error={null} listItems={[]} {...listProps} />
        );
        const output = lastFrame();
        expect(output).toContain('No items.');
        expect(output).toContain('← Back');
    });

    it('shows confirm delete for single item', () => {
        const { lastFrame } = render(
            <ScreenEntries
                {...listProps}
                loading={false}
                error={null}
                listItems={[]}
                filteredItems={[{ id: 'e1', label: 'My Entry' }]}
                confirmDeleteId="e1"
            />
        );
        const output = lastFrame();
        expect(output).toContain('Delete');
        expect(output).toContain('My Entry');
        expect(output).toContain('Y to confirm');
        expect(output).toContain('Esc to cancel');
    });

    it('shows bulk delete confirm', () => {
        const { lastFrame } = render(
            <ScreenEntries
                {...listProps}
                loading={false}
                error={null}
                listItems={[]}
                selectedIds={new Set(['a', 'b'])}
                bulkConfirm="delete"
            />
        );
        const output = lastFrame();
        expect(output).toContain('Delete');
        expect(output).toContain('2 item(s)');
    });

    it('shows bulk actions menu', () => {
        const { lastFrame } = render(
            <ScreenEntries
                {...listProps}
                loading={false}
                error={null}
                listItems={[]}
                selectedIds={new Set(['x'])}
                showBulkMenu={true}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Bulk actions');
        expect(output).toContain('1 selected');
        expect(output).toContain('Delete selected');
        expect(output).toContain('Export JSON');
    });
});
