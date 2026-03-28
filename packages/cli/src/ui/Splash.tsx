import React from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';

export interface SplashProps {
    /** App version (e.g. release line from package.json) */
    version?: string;
    /** Tagline shown under the logo */
    tagline?: string;
    /** Optional status line (e.g. "Connecting to api.moteur.io…") */
    status?: string;
}

export const MOTEUR_ASCII = [
    ' _  _   __  ____  ____  _  _  ____ ',
    '( \\/ ) /  \\(_  _)(  __)/ )( \\(  _ \\',
    '/ \\/ \\(  O ) )(   ) _) ) \\/ ( )   /',
    '\\_)(_/ \\__/ (__) (____)\\____/(__\\_)'
];

export interface LogoAndTaglineProps {
    version?: string;
    tagline?: string;
}

/**
 * Reusable MOTEUR logo + version/tagline + Atelier. Used by Splash and Login.
 */
export function LogoAndTagline({
    version = '2026.3.27',
    tagline = 'Structured Content Engine'
}: LogoAndTaglineProps): React.ReactElement {
    return (
        <Box flexDirection="column" alignItems="center" marginBottom={2}>
            <Box marginBottom={1} flexDirection="column">
                {MOTEUR_ASCII.map((line, i) => (
                    <Text key={i} color={colors.amber}>
                        {line}
                    </Text>
                ))}
            </Box>
            <Box marginBottom={1}>
                <Text color={colors.dim}>
                    v{version} · {tagline}
                </Text>
            </Box>
            <Box>
                <Text color={colors.amber}>Atelier</Text>
            </Box>
        </Box>
    );
}

/**
 * Intro splash: MOTEUR ASCII art, version, tagline. Shown for a beat then caller hides it.
 */
export function Splash({
    version = '2026.3.27',
    tagline = 'Structured Content Engine',
    status
}: SplashProps): React.ReactElement {
    return (
        <Box flexDirection="column" alignItems="center" justifyContent="center" padding={4}>
            <LogoAndTagline version={version} tagline={tagline} />
            {status ? (
                <Box marginTop={1}>
                    <Text color={colors.dim}>{status}</Text>
                </Box>
            ) : null}
        </Box>
    );
}
