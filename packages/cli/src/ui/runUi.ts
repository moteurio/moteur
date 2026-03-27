import React, { useState, useCallback, useEffect } from 'react';
import { render, Text } from 'ink';
import { App } from './App.js';
import type { MoteurAdminClient } from '@moteurio/client';
import type { CliConfig } from '../config.js';
import type { OnboardingState } from './Onboarding.js';

export interface StudioUiProps {
    getClient: () => Promise<MoteurAdminClient>;
    saveConfig: (config: CliConfig) => Promise<void>;
    loadConfig: () => Promise<CliConfig>;
    projectId: string | null;
    projectLabel: string;
    apiUrl: string;
    loggedIn: boolean;
    /** JWT token for Presence (Socket.IO). Pass from loadConfig().token when logged in. */
    token?: string | null;
    onLogout: () => void | Promise<void>;
    firstRun?: boolean;
    onboardingState?: OnboardingState | null;
    onOnboardingStateChange?: (state: OnboardingState) => void;
}

function StudioWrapper(props: StudioUiProps): React.ReactElement {
    const { getClient, saveConfig, loadConfig, projectId, projectLabel, apiUrl, onLogout } = props;
    const [client, setClient] = useState<MoteurAdminClient | null>(null);
    const [loggedIn, setLoggedIn] = useState(props.loggedIn);
    const [token, setToken] = useState<string | null>(props.token ?? null);

    const refreshClient = useCallback(async () => {
        const c = await getClient();
        setClient(c);
        return c;
    }, [getClient]);

    const refreshToken = useCallback(async () => {
        const cfg = await loadConfig();
        setToken(cfg?.token ?? null);
        return cfg?.token ?? null;
    }, [loadConfig]);

    useEffect(() => {
        let cancelled = false;
        getClient().then(c => {
            if (!cancelled) setClient(c);
        });
        loadConfig().then(cfg => {
            if (!cancelled) setToken(cfg?.token ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, [getClient, loadConfig]);

    const onLoginSuccess = useCallback(async () => {
        await refreshClient();
        setLoggedIn(true);
        await refreshToken();
    }, [refreshClient, refreshToken]);

    const onSessionExpired = useCallback(async () => {
        await refreshClient();
        setLoggedIn(false);
    }, [refreshClient]);

    const handleLogout = useCallback(async () => {
        await onLogout();
        await refreshClient();
        setLoggedIn(false);
    }, [onLogout, refreshClient]);

    if (client === null) {
        return React.createElement(Text, null, 'Loading…');
    }

    return React.createElement(App, {
        client,
        projectId,
        projectLabel,
        apiUrl,
        loggedIn,
        token: token ?? undefined,
        onLogout: handleLogout,
        onSessionExpired,
        saveConfig,
        loadConfig: () => loadConfig(),
        onLoginSuccess,
        firstRun: props.firstRun,
        onboardingState: props.onboardingState,
        onOnboardingStateChange: props.onOnboardingStateChange
    });
}

export function runStudioUi(props: StudioUiProps): void {
    render(React.createElement(StudioWrapper, props));
}
