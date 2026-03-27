import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

export interface ScreenAccountProps {
    screen: 'account_whoami' | 'account_logout';
    loggedIn: boolean;
    whoami: Record<string, unknown> | null;
}

/**
 * Account screens: Who am I (whoami content) or Logout (message).
 */
export function ScreenAccount({
    screen,
    loggedIn,
    whoami
}: ScreenAccountProps): React.ReactElement {
    if (screen === 'account_logout') {
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text>Select Logout and press Enter to sign out.</Text>
            </Box>
        );
    }
    if (!loggedIn) {
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text color={colors.amber}>Not logged in.</Text>
                <Text color={colors.dim}>Run: moteur auth login</Text>
            </Box>
        );
    }
    if (whoami !== null && Object.keys(whoami).length > 0) {
        const id = whoami.id != null ? String(whoami.id) : null;
        const email = typeof whoami.email === 'string' ? whoami.email : null;
        const name = typeof whoami.name === 'string' ? whoami.name : null;
        const username = typeof whoami.username === 'string' ? whoami.username : null;
        const display = email ?? name ?? username ?? id ?? '—';
        return (
            <Box flexDirection="column" paddingX={2}>
                <Text bold color={colors.amber}>
                    Who am I
                </Text>
                <Box flexDirection="column" marginTop={1}>
                    {email != null && (
                        <Box>
                            <Text color={colors.dim}>Email: </Text>
                            <Text>{email}</Text>
                        </Box>
                    )}
                    {name != null && (
                        <Box>
                            <Text color={colors.dim}>Name: </Text>
                            <Text>{name}</Text>
                        </Box>
                    )}
                    {username != null && (
                        <Box>
                            <Text color={colors.dim}>Username: </Text>
                            <Text>{username}</Text>
                        </Box>
                    )}
                    {id != null && (
                        <Box>
                            <Text color={colors.dim}>ID: </Text>
                            <Text color={colors.dim}>{id}</Text>
                        </Box>
                    )}
                    {display === '—' && (
                        <Text color={colors.dim}>No email/name/username in profile.</Text>
                    )}
                </Box>
            </Box>
        );
    }
    if (whoami === null) {
        return (
            <Box paddingX={2}>
                <Text color={colors.error}>Failed to load user.</Text>
            </Box>
        );
    }
    return (
        <Box paddingX={2}>
            <Text color={colors.teal}>Loading…</Text>
        </Box>
    );
}
