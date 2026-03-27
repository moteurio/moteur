import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export function ScreenAiConfig(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold>AI Configuration</Text>
            <Text color={colors.dim}>Use Studio to configure AI providers and settings.</Text>
        </Box>
    );
}
