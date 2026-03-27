import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export function ScreenProjectSettings(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold>Project Settings</Text>
            <Text color={colors.dim}>Use Studio or CLI: moteur projects get</Text>
        </Box>
    );
}
