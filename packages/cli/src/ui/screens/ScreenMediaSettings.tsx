import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export function ScreenMediaSettings(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold>Media Settings</Text>
            <Text color={colors.dim}>Use Studio to configure media storage and variants.</Text>
        </Box>
    );
}
