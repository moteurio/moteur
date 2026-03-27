/**
 * Moteur CLI theme — Foundry dark palette from moteur-admin design tokens.
 * Use these for all UI; avoid Ink named colours.
 */
import chalk from 'chalk';

export const colors = {
    amber: '#E07C00',
    teal: '#259189',
    dim: '#A89E88',
    bright: '#E5DFD0',
    error: '#CC3322',
    warn: '#B87E00',
    success: '#2A7A50',
    vermillion: '#CC3322',
    selectedBg: '#E07C00',
    selectedFg: '#0B0A08',
    barBg: '#2B271D'
} as const;

export const chalkTheme = {
    accent: chalk.hex(colors.amber),
    teal: chalk.hex(colors.teal),
    dim: chalk.hex(colors.dim),
    bright: chalk.hex(colors.bright),
    error: chalk.hex(colors.error),
    warn: chalk.hex(colors.warn),
    success: chalk.hex(colors.success)
};
