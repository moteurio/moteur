import React from 'react';
import { Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from './theme.js';

export interface LoadingSpinnerProps {
    /** Label after the spinner (e.g. "Loading…", "Loading projects…") */
    label?: string;
}

/**
 * Branded loading indicator: ink-spinner (dots) in theme amber with label.
 */
export function LoadingSpinner({ label = 'Loading' }: LoadingSpinnerProps): React.ReactElement {
    return (
        <Text color={colors.amber}>
            <Spinner type="dots" /> {label}
        </Text>
    );
}
