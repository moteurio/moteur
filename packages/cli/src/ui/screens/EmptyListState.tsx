import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export interface EmptyListStateProps {
    message?: string;
    canCreate?: boolean;
}

export function EmptyListState({
    message = 'No items.',
    canCreate = false
}: EmptyListStateProps): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text color={colors.dim}>{message}</Text>
            {canCreate && <Text color={colors.amber}>Press N to create one</Text>}
            <Text color={colors.dim}>← Back (Esc / ←)</Text>
        </Box>
    );
}
