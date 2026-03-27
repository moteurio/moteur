import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { ListView } from '../../src/ui/screens/ListView.js';

describe('ListView', () => {
    const emptyProps = {
        filteredItems: [],
        listCursor: 0,
        selectedIds: new Set<string>(),
        filter: '',
        detail: null,
        hasMore: false
    };

    it('renders detail view when detail is set', () => {
        const { lastFrame } = render(
            <ListView {...emptyProps} detail={{ id: 'p1', label: 'My Project' }} />
        );
        const output = lastFrame();
        expect(output).toContain('My Project');
        expect(output).toContain('p1');
        expect(output).toMatch(/ID\s+p1/);
        expect(output).toContain('Esc/← back');
    });

    it('renders list of items with cursor and selection', () => {
        const { lastFrame } = render(
            <ListView
                filteredItems={[
                    { id: 'a', label: 'Item A' },
                    { id: 'b', label: 'Item B' }
                ]}
                listCursor={1}
                selectedIds={new Set(['a'])}
                filter=""
                detail={null}
                hasMore={false}
            />
        );
        const output = lastFrame();
        expect(output).toContain('Item A');
        expect(output).toContain('Item B');
        expect(output).toContain('▶');
        expect(output).toContain('☑');
        expect(output).toContain('☐');
    });

    it('shows filter line when filter is non-empty', () => {
        const { lastFrame } = render(<ListView {...emptyProps} filter="test" />);
        const output = lastFrame();
        expect(output).toContain('Filter:');
        expect(output).toContain('test');
        expect(output).toContain('Esc to clear');
    });

    it('shows selected count and bulk actions when selection non-empty', () => {
        const { lastFrame } = render(
            <ListView
                filteredItems={[{ id: 'x', label: 'X' }]}
                listCursor={0}
                selectedIds={new Set(['x'])}
                filter=""
                detail={null}
                hasMore={false}
            />
        );
        const output = lastFrame();
        expect(output).toContain('1 selected');
        expect(output).toContain('bulk actions');
    });

    it('shows hasMore hint when hasMore is true', () => {
        const { lastFrame } = render(
            <ListView {...emptyProps} filteredItems={[{ id: '1', label: 'One' }]} hasMore={true} />
        );
        const output = lastFrame();
        expect(output).toContain('more items available');
    });
});
