import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

/** Placeholder for User data section (submissions live under this menu in the TUI). */
export function ScreenUserdata(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold color={colors.amber}>
                User data
            </Text>
            <Text color={colors.dim}>
                Use the CLI: moteur userdata list — or open Submissions from the menu.
            </Text>
        </Box>
    );
}
