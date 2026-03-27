import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { colors } from './theme.js';
import { Divider } from './Divider.js';
import type { MoteurClient } from './types.js';

export interface OnboardingState {
    projectCreated: boolean;
    accountCreated: boolean;
    frontendScaffolded: boolean;
    firstModelCreated: boolean;
    firstEntryCreated: boolean;
    firstEntryPublished: boolean;
    firstApiRequest: boolean;
    deployedToVercel: boolean;
    completedAt: string | null;
    projectName: string;
    projectId: string;
    mode: 'cloud' | 'local';
    framework: string;
    apiUrl: string;
    studioUrl: string;
}

export interface OnboardingProps {
    state: OnboardingState;
    client: MoteurClient;
    onComplete: () => void;
    onStateChange: (state: OnboardingState) => void;
}

interface ChecklistItem {
    key: keyof OnboardingState;
    label: string;
    hint: string;
    canPoll: boolean;
}

const CHECKLIST: ChecklistItem[] = [
    { key: 'projectCreated', label: 'Project created', hint: '', canPoll: false },
    { key: 'accountCreated', label: 'Account created', hint: '', canPoll: false },
    { key: 'frontendScaffolded', label: 'Frontend scaffolded', hint: '', canPoll: false },
    {
        key: 'firstModelCreated',
        label: 'Create your first content model',
        hint: '→ Studio → Models',
        canPoll: true
    },
    { key: 'firstEntryCreated', label: 'Add an entry', hint: '→ Studio → Content', canPoll: true },
    { key: 'firstEntryPublished', label: 'Publish your first entry', hint: '', canPoll: true },
    {
        key: 'firstApiRequest',
        label: 'Make your first API request',
        hint: '→ docs.moteur.io/quickstart',
        canPoll: false
    },
    {
        key: 'deployedToVercel',
        label: 'Deploy to Vercel',
        hint: '→ docs.moteur.io/deploy',
        canPoll: false
    }
];

export function Onboarding({
    state,
    client,
    onComplete,
    onStateChange
}: OnboardingProps): React.ReactElement {
    const { exit } = useApp();
    const [currentState, setCurrentState] = useState<OnboardingState>(state);
    const [logs, setLogs] = useState<string[]>([]);

    const updateState = useCallback(
        (updates: Partial<OnboardingState>) => {
            setCurrentState(prev => {
                const next = { ...prev, ...updates };
                onStateChange(next);
                return next;
            });
        },
        [onStateChange]
    );

    // Poll API for checklist progress
    useEffect(() => {
        if (!currentState.projectId) return;

        const interval = setInterval(async () => {
            try {
                // Check for models
                if (!currentState.firstModelCreated) {
                    const result = await client.forProject(currentState.projectId).models.list();
                    const models = (result as { models?: unknown[] })?.models;
                    if (models && models.length > 0) {
                        updateState({ firstModelCreated: true });
                    }
                }

                // Check for entries
                if (currentState.firstModelCreated && !currentState.firstEntryCreated) {
                    const modelsResult = await client
                        .forProject(currentState.projectId)
                        .models.list();
                    const models = (modelsResult as { models?: { id: string }[] })?.models;
                    if (models && models.length > 0) {
                        const entriesResult = await client
                            .forProject(currentState.projectId)
                            .entries.list(models[0].id);
                        const entries = (entriesResult as { entries?: unknown[] })?.entries;
                        if (entries && entries.length > 0) {
                            updateState({ firstEntryCreated: true });
                        }
                    }
                }

                // Check for published entries
                if (currentState.firstEntryCreated && !currentState.firstEntryPublished) {
                    const modelsResult = await client
                        .forProject(currentState.projectId)
                        .models.list();
                    const models = (modelsResult as { models?: { id: string }[] })?.models;
                    if (models && models.length > 0) {
                        const entriesResult = await client
                            .forProject(currentState.projectId)
                            .entries.list(models[0].id);
                        const entries = (entriesResult as { entries?: { status?: string }[] })
                            ?.entries;
                        if (entries?.some(e => e.status === 'published')) {
                            updateState({ firstEntryPublished: true });
                        }
                    }
                }
            } catch {
                // Polling errors are non-fatal
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [
        client,
        currentState.projectId,
        currentState.firstModelCreated,
        currentState.firstEntryCreated,
        currentState.firstEntryPublished,
        updateState
    ]);

    // Check if all pollable items are done
    useEffect(() => {
        const pollableComplete = CHECKLIST.filter(item => item.canPoll).every(
            item => currentState[item.key] === true
        );

        if (pollableComplete && !currentState.completedAt) {
            updateState({ completedAt: new Date().toISOString() });
            setTimeout(() => onComplete(), 2000);
        }
    }, [currentState, updateState, onComplete]);

    useInput((input, key) => {
        if (input === 'q' || input === 'Q') {
            exit();
        }
        if (input === '?' || key.escape) {
            onComplete();
        }
    });

    const studioUrl = currentState.studioUrl;
    const apiUrl = currentState.apiUrl;
    const name = currentState.projectName;
    const isCloud = currentState.mode === 'cloud';

    return (
        <Box flexDirection="column" padding={1}>
            {/* Summary box */}
            <Box
                flexDirection="column"
                borderStyle="round"
                borderColor={colors.teal}
                paddingX={3}
                paddingY={1}
                marginBottom={1}
            >
                <Text color={colors.bright} bold>
                    {name} is ready.
                </Text>
                <Box height={1} />
                <Box flexDirection="column">
                    {studioUrl && (
                        <Box>
                            <Text color={colors.dim}>{'Studio     '}</Text>
                            <Text color={colors.bright}>{studioUrl}</Text>
                        </Box>
                    )}
                    {currentState.framework !== 'none' && (
                        <Box>
                            <Text color={colors.dim}>{'Frontend   '}</Text>
                            <Text color={colors.bright}>http://localhost:3000</Text>
                        </Box>
                    )}
                    <Box>
                        <Text color={colors.dim}>{'API        '}</Text>
                        <Text color={colors.bright}>
                            {apiUrl}
                            {isCloud ? `/projects/${currentState.projectId}` : ''}
                        </Text>
                    </Box>
                </Box>
                <Box height={1} />
                <Text color={colors.dim}>Opening Studio in your browser...</Text>
            </Box>

            {/* Getting started checklist */}
            <Box flexDirection="column" marginBottom={1}>
                <Text color={colors.bright} bold>
                    Getting started
                </Text>
                <Box height={1} />
                {CHECKLIST.map(item => {
                    const done = currentState[item.key] === true;
                    const marker = done ? (
                        <Text color={colors.success}>✓</Text>
                    ) : (
                        <Text color={colors.dim}>○</Text>
                    );

                    return (
                        <Box key={item.key}>
                            <Box width={3}>{marker}</Box>
                            <Text color={done ? colors.dim : colors.bright}>{item.label}</Text>
                            {item.hint && !done && (
                                <Text color={colors.dim}>
                                    {'  '}
                                    {item.hint}
                                </Text>
                            )}
                        </Box>
                    );
                })}
            </Box>

            {/* Keyboard hints */}
            <Box>
                <Text color={colors.dim}>Press ? for help · Press q to quit</Text>
            </Box>

            <Divider length={60} />

            {/* Log area (local only) */}
            {!isCloud && logs.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                    {logs.slice(-10).map((line, i) => (
                        <Text key={i} color={colors.dim}>
                            {line}
                        </Text>
                    ))}
                </Box>
            )}
        </Box>
    );
}
