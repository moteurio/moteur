import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export function ScreenPermissions(): React.ReactElement {
    return (
        <Box flexDirection="column" paddingX={2}>
            <Text bold>Users & Permissions</Text>
            <Text color={colors.dim}>Use Studio to manage users and role permissions.</Text>
        </Box>
    );
}
