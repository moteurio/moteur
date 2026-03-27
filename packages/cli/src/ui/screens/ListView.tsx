import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { LIST_ID_WIDTH } from '../types.js';
import type { ListItem } from '../types.js';

const HIDDEN_DETAIL_KEYS = new Set(['_loaded', '_loading']);

function formatDetailValue(value: unknown, maxLen = 80): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') {
        if (value.length > maxLen) return value.slice(0, maxLen) + '…';
        return value || '—';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const compact = JSON.stringify(value);
        if (compact.length <= maxLen) return compact;
        return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
        const compact = JSON.stringify(value);
        if (compact.length <= maxLen) return compact;
        return `{${Object.keys(value as Record<string, unknown>).length} keys}`;
    }
    return String(value);
}

function formatFieldLabel(key: string): string {
    return key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export interface ListViewProps {
    filteredItems: ListItem[];
    listCursor: number;
    selectedIds: Set<string>;
    filter: string;
    detail: Record<string, unknown> | null;
    hasMore: boolean;
}

/**
 * Shared list + detail view for list-based screens.
 */
export function ListView({
    filteredItems,
    listCursor,
    selectedIds,
    filter,
    detail,
    hasMore
}: ListViewProps): React.ReactElement {
    if (detail) {
        const isLoading = detail._loading === true;
        const isLoaded = detail._loaded === true;
        const label = String(detail.label ?? detail.name ?? detail.handle ?? detail.id ?? '');
        const id = String(detail.id ?? '');

        const visibleEntries = Object.entries(detail).filter(([k]) => !HIDDEN_DETAIL_KEYS.has(k));

        return (
            <Box flexDirection="column" paddingX={1}>
                <Box marginBottom={1}>
                    <Text bold color={colors.amber}>
                        {label}
                    </Text>
                </Box>
                <Box flexDirection="column">
                    <Box>
                        <Box width={18}>
                            <Text color={colors.dim}>ID</Text>
                        </Box>
                        <Text>{id}</Text>
                    </Box>
                    {isLoading && !isLoaded && (
                        <Box marginTop={1}>
                            <Text color={colors.teal}>Loading details…</Text>
                        </Box>
                    )}
                    {isLoaded &&
                        visibleEntries
                            .filter(([k]) => k !== 'id' && k !== 'label' && k !== 'name')
                            .map(([key, value]) => (
                                <Box key={key}>
                                    <Box width={18} flexShrink={0}>
                                        <Text color={colors.dim}>{formatFieldLabel(key)}</Text>
                                    </Box>
                                    <Box flexGrow={1}>
                                        <Text wrap="truncate">{formatDetailValue(value)}</Text>
                                    </Box>
                                </Box>
                            ))}
                </Box>
                <Box marginTop={1}>
                    <Text color={colors.dim}>D delete O open in $EDITOR Esc/← back</Text>
                </Box>
            </Box>
        );
    }
    return (
        <Box flexDirection="column">
            {filter.trim() && (
                <Box marginBottom={1}>
                    <Text color={colors.dim}>Filter: &quot;{filter}&quot; (Esc to clear)</Text>
                </Box>
            )}
            {selectedIds.size > 0 && (
                <Box marginBottom={1}>
                    <Text color={colors.amber}>
                        {selectedIds.size} selected — Enter bulk actions
                    </Text>
                </Box>
            )}
            {filteredItems.map((item, i) => {
                const selected = i === listCursor;
                const checked = selectedIds.has(item.id);
                const statusColor =
                    item.status === 'published'
                        ? colors.success
                        : item.status === 'draft'
                          ? colors.dim
                          : undefined;
                return (
                    <Box key={item.id} flexDirection="row">
                        <Box width={3}>
                            <Text color={selected ? colors.amber : colors.dim}>
                                {selected ? '▶' : ' '}
                                {checked ? '☑' : '☐'}
                            </Text>
                        </Box>
                        <Box flexGrow={1} minWidth={10}>
                            <Text color={selected ? colors.bright : undefined} bold={selected}>
                                {item.label || item.id}
                            </Text>
                            {item.status && <Text color={statusColor}> [{item.status}]</Text>}
                            {item.extra && <Text color={colors.dim}> ({item.extra})</Text>}
                        </Box>
                        <Box width={LIST_ID_WIDTH}>
                            <Text color={colors.dim}>
                                {String(item.id).slice(-LIST_ID_WIDTH + 1)}
                            </Text>
                        </Box>
                    </Box>
                );
            })}
            {hasMore && (
                <Box marginTop={1}>
                    <Text color={colors.dim}>… more items available</Text>
                </Box>
            )}
        </Box>
    );
}
