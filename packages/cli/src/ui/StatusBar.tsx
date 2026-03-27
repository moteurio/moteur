import React from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';
import { KeyHints } from './KeyHint.js';

export interface KeyHintPair {
    k: string;
    label: string;
}

export interface StatusBarProps {
    /** Optional structured hints (key in amber, label in dim). */
    hints?: KeyHintPair[];
    /** Fallback: single-line string when hints not provided. */
    hint?: string;
}

/**
 * Keyboard hints bar: amber keys, dim labels. Uses KeyHints when hints[] provided.
 */
export function StatusBar({ hints, hint }: StatusBarProps): React.ReactElement {
    return (
        <Box paddingX={2} paddingY={1}>
            {hints && hints.length > 0 ? (
                <KeyHints hints={hints} />
            ) : (
                <Text color={colors.amber}>{typeof hint === 'string' ? hint : ''}</Text>
            )}
        </Box>
    );
}
