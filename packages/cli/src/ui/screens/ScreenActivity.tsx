import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import type { ListItem } from '../types.js';
import { EmptyListState } from './EmptyListState.js';

export interface ScreenActivityProps {
    loading?: boolean;
    error?: string | null;
    listItems?: ListItem[];
}

export function ScreenActivity(props: ScreenActivityProps = {}): React.ReactElement {
    const { loading = false, error = null, listItems = [] } = props;
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
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text bold color={colors.amber}>
                    Recent activity
                </Text>
                <EmptyListState message="No recent activity." />
                <Box marginTop={1}>
                    <Text color={colors.dim}>Full logs: moteur activity list</Text>
                </Box>
            </Box>
        );
    }
    return (
        <Box flexDirection="column" paddingX={2}>
            <Box marginBottom={1}>
                <Text bold color={colors.amber}>
                    Recent activity
                </Text>
            </Box>
            {listItems.map((item, i) => (
                <Box key={item.id ?? i} flexDirection="row">
                    <Box flexGrow={1} minWidth={10}>
                        <Text>{item.label}</Text>
                    </Box>
                    <Box>
                        <Text color={colors.dim}>{item.id}</Text>
                    </Box>
                </Box>
            ))}
            <Box marginTop={1}>
                <Text color={colors.dim}>Full logs: moteur activity list</Text>
            </Box>
        </Box>
    );
}
