import React from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';

export interface StatusLineProps {
    host: string;
    user: string;
    project: string;
    /** Whether Presence (Socket.IO) is connected. */
    presenceConnected?: boolean;
    /** Number of users in the project room (Presence). */
    presenceCount?: number;
    /** Presence connection error message (e.g. auth failed). */
    presenceError?: string | null;
}

/**
 * Bottom footer: Host / User / Project. Optional Presence line (connected + count or error).
 */
export function StatusLine({
    host,
    user,
    project,
    presenceConnected,
    presenceCount,
    presenceError
}: StatusLineProps): React.ReactElement {
    return (
        <Box paddingX={0} paddingY={0} flexDirection="column">
            <Box>
                <Text color={colors.dim}>
                    Host: {host} User: {user} Project: {project}
                </Text>
            </Box>
            {presenceConnected !== undefined && (
                <Box>
                    {presenceError ? (
                        <Text color={colors.error}>Presence: {presenceError}</Text>
                    ) : (
                        <Text color={colors.dim}>
                            Presence:{' '}
                            {presenceConnected
                                ? `${presenceCount ?? 0} in project`
                                : 'disconnected'}
                        </Text>
                    )}
                </Box>
            )}
        </Box>
    );
}
