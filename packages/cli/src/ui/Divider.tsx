import React from 'react';
import { Text } from 'ink';
import { colors } from './theme.js';

export interface DividerProps {
    /** Character to repeat (default: '─') */
    character?: string;
    /** Length of the line (default: 40) */
    length?: number;
}

/**
 * Horizontal divider line. Use between sections (e.g. content and status bar).
 */
export function Divider({ character = '─', length = 40 }: DividerProps): React.ReactElement {
    const line = character.repeat(Math.max(0, length));
    return <Text color={colors.dim}>{line}</Text>;
}
