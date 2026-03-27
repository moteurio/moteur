import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { LoadingSpinner } from '../LoadingSpinner.js';
import type { ListItem } from '../types.js';
import { EmptyListState } from './EmptyListState.js';
import { ListView } from './ListView.js';

export interface ScreenEntriesProps {
    loading: boolean;
    error: string | null;
    listItems: ListItem[];
    filteredItems: ListItem[];
    listCursor: number;
    filter: string;
    selectedIds: Set<string>;
    detail: Record<string, unknown> | null;
    hasMore: boolean;
    confirmDeleteId: string | null;
    bulkConfirm: 'delete' | null;
    showBulkMenu: boolean;
}

/**
 * Entries screen: confirm delete, bulk confirm, bulk menu, or list/detail.
 */
export function ScreenEntries({
    loading,
    error,
    listItems,
    filteredItems,
    listCursor,
    filter,
    selectedIds,
    detail,
    hasMore,
    confirmDeleteId,
    bulkConfirm,
    showBulkMenu
}: ScreenEntriesProps): React.ReactElement {
    if (confirmDeleteId) {
        const item = filteredItems.find(i => i.id === confirmDeleteId);
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text color={colors.error}>
                    Delete "{item?.label ?? confirmDeleteId}"? Press Y to confirm, Esc to cancel
                </Text>
            </Box>
        );
    }
    if (bulkConfirm === 'delete') {
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text color={colors.error}>
                    Delete {selectedIds.size} item(s)? Press Y to confirm, Esc to cancel
                </Text>
            </Box>
        );
    }
    if (showBulkMenu) {
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text bold color={colors.amber}>
                    Bulk actions ({selectedIds.size} selected)
                </Text>
                <Text color={colors.dim}>1 — Delete selected (then confirm with Y)</Text>
                <Text color={colors.dim}>2 — Export JSON to stdout</Text>
                <Text color={colors.dim}>Esc — Cancel</Text>
            </Box>
        );
    }
    if (loading) {
        return (
            <Box paddingX={2}>
                <LoadingSpinner label="Loading" />
            </Box>
        );
    }
    if (error) {
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text color={colors.error}>{error}</Text>
            </Box>
        );
    }
    if (listItems.length === 0) {
        return <EmptyListState canCreate />;
    }
    return (
        <ListView
            filteredItems={filteredItems}
            listCursor={listCursor}
            selectedIds={selectedIds}
            filter={filter}
            detail={detail}
            hasMore={hasMore}
        />
    );
}
