import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
    message: string;
    type?: ToastType;
    /** Duration in ms before auto-dismiss. 0 = no auto-dismiss. */
    durationMs?: number;
    onDismiss?: () => void;
}

/**
 * Transient notification at top of content area. Auto-dismisses after durationMs (default 2000).
 */
export function Toast({
    message,
    type = 'info',
    durationMs = 2000,
    onDismiss
}: ToastProps): React.ReactElement {
    useEffect(() => {
        if (durationMs <= 0 || !onDismiss) return;
        const t = setTimeout(onDismiss, durationMs);
        return () => clearTimeout(t);
    }, [durationMs, onDismiss]);

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '·';
    const color =
        type === 'success' ? colors.success : type === 'error' ? colors.error : colors.amber;

    return (
        <Box marginBottom={1} paddingX={1} paddingY={0}>
            <Text color={color} bold>
                {icon} {message}
            </Text>
        </Box>
    );
}
