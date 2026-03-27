import React from 'react';
import { Text } from 'ink';
import { colors } from './theme.js';

export interface KeyHintProps {
    /** Key or key combo (e.g. "Enter", "Esc", "↑↓") */
    k: string;
    /** Short label (e.g. "open", "back") */
    label: string;
}

/**
 * Single key + label pair: key in amber, label in dim. Use in StatusBar or inline.
 */
export function KeyHint({ k, label }: KeyHintProps): React.ReactElement {
    return (
        <>
            <Text color={colors.amber}>{k}</Text>
            <Text color={colors.dim}> {label}</Text>
        </>
    );
}

export interface KeyHintsProps {
    /** List of key/label pairs. Rendered with spaces between. */
    hints: { k: string; label: string }[];
}

/**
 * Multiple KeyHints in a row (e.g. for StatusBar).
 */
export function KeyHints({ hints }: KeyHintsProps): React.ReactElement {
    return (
        <>
            {hints.map((h, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <Text color={colors.dim}> </Text>}
                    <KeyHint k={h.k} label={h.label} />
                </React.Fragment>
            ))}
        </>
    );
}
