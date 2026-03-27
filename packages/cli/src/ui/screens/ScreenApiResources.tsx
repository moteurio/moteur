import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export function ScreenApiResources(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold>API Resources</Text>
            <Text color={colors.dim}>Use Studio to manage API keys and channels.</Text>
        </Box>
    );
}
