import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import type { ListItem } from '../types.js';
import { EmptyListState } from './EmptyListState.js';
import { ListView } from './ListView.js';

export interface ScreenModelsProps {
    loading: boolean;
    error: string | null;
    listItems: ListItem[];
    filteredItems: ListItem[];
    listCursor: number;
    filter: string;
    selectedIds: Set<string>;
    detail: Record<string, unknown> | null;
    hasMore: boolean;
}

export function ScreenModels(props: ScreenModelsProps): React.ReactElement {
    const {
        loading,
        error,
        listItems,
        filteredItems,
        listCursor,
        filter,
        selectedIds,
        detail,
        hasMore
    } = props;
    if (loading) {
        return (
            <Box paddingX={2}>
                <Text color={colors.teal}>Loading…</Text>
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
