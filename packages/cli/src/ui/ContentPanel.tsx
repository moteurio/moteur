import React from 'react';
import { Box, Text } from 'ink';
import { colors } from './theme.js';
import { StatusBar } from './StatusBar.js';
import { Toast } from './Toast.js';
import type { Screen, MoteurClient } from './types.js';
import type { ListItem } from './types.js';
import {
    ScreenProject,
    ScreenEntries,
    ScreenPages,
    ScreenModels,
    ScreenTemplates,
    ScreenStructures,
    ScreenBlocks,
    ScreenNavigations,
    ScreenLayouts,
    ScreenMedia,
    ScreenBlueprints,
    ScreenActivity,
    ScreenForms,
    ScreenSubmissions,
    ScreenWebhooks,
    ScreenProjectSettings,
    ScreenApiResources,
    ScreenMediaSettings,
    ScreenAiConfig,
    ScreenPermissions,
    ScreenAccount
} from './screens/index.js';

export interface ContentPanelProps {
    /** When true, show focus border (amber). */
    focused?: boolean;
    breadcrumb: string;
    keyboardHint: string;
    currentScreen: Screen;
    hasProject: boolean;
    loggedIn: boolean;
    // List data (for list screens)
    listItems: ListItem[];
    filteredItems: ListItem[];
    listCursor: number;
    filter: string;
    selectedIds: Set<string>;
    detail: Record<string, unknown> | null;
    loading: boolean;
    error: string | null;
    hasMore: boolean;
    // Entries-specific
    confirmDeleteId: string | null;
    bulkConfirm: 'delete' | null;
    showBulkMenu: boolean;
    // Account
    whoami: Record<string, unknown> | null;
    // Project
    projectLabel: string;
    projectId: string | null;
    // Toast
    toast: { message: string; type: 'success' | 'error' | 'info' } | null;
    onDismissToast: () => void;
    // Client
    client?: MoteurClient;
}

/**
 * Content area: header/breadcrumb + screen router + StatusBar.
 * Router only — picks screen component and passes props; renders nothing itself for content.
 */
export function ContentPanel(props: ContentPanelProps): React.ReactElement {
    const {
        focused = false,
        breadcrumb,
        keyboardHint,
        currentScreen,
        hasProject,
        loggedIn,
        listItems,
        filteredItems,
        listCursor,
        filter,
        selectedIds,
        detail,
        loading,
        error,
        hasMore,
        confirmDeleteId,
        bulkConfirm,
        showBulkMenu,
        whoami,
        projectLabel,
        projectId,
        toast,
        onDismissToast,
        client
    } = props;

    const listScreenProps = {
        loading,
        error,
        listItems,
        filteredItems,
        listCursor,
        filter,
        selectedIds,
        detail,
        hasMore
    };

    const renderScreen = (): React.ReactElement => {
        if (!hasProject && currentScreen !== 'project') {
            return (
                <Box flexDirection="column" paddingX={2}>
                    <Text color={colors.amber}>No default project set.</Text>
                    <Text color={colors.dim}>
                        Run: moteur projects list — then set default from the menu.
                    </Text>
                </Box>
            );
        }
        switch (currentScreen) {
            case 'project':
                return (
                    <ScreenProject
                        projectLabel={projectLabel}
                        projectId={projectId}
                        detail={detail}
                        client={client}
                    />
                );
            case 'entries':
                return (
                    <ScreenEntries
                        {...listScreenProps}
                        confirmDeleteId={confirmDeleteId}
                        bulkConfirm={bulkConfirm}
                        showBulkMenu={showBulkMenu}
                    />
                );
            case 'pages':
                return <ScreenPages {...listScreenProps} />;
            case 'models':
                return <ScreenModels {...listScreenProps} />;
            case 'templates':
                return <ScreenTemplates {...listScreenProps} />;
            case 'structures':
                return <ScreenStructures {...listScreenProps} />;
            case 'blocks':
                return <ScreenBlocks {...listScreenProps} />;
            case 'blueprints':
                return <ScreenBlueprints {...listScreenProps} />;
            case 'navigations':
                return <ScreenNavigations {...listScreenProps} />;
            case 'layouts':
                return <ScreenLayouts {...listScreenProps} />;
            case 'media':
                return <ScreenMedia {...listScreenProps} />;
            case 'activity':
                return <ScreenActivity loading={loading} error={error} listItems={listItems} />;
            case 'forms':
                return <ScreenForms {...listScreenProps} />;
            case 'submissions':
                return <ScreenSubmissions {...listScreenProps} />;
            case 'webhooks':
                return <ScreenWebhooks {...listScreenProps} />;
            case 'project_settings':
                return <ScreenProjectSettings />;
            case 'api_resources':
                return <ScreenApiResources />;
            case 'media_settings':
                return <ScreenMediaSettings />;
            case 'ai_config':
                return <ScreenAiConfig />;
            case 'permissions':
                return <ScreenPermissions />;
            case 'account_whoami':
            case 'account_logout':
                return <ScreenAccount screen={currentScreen} loggedIn={loggedIn} whoami={whoami} />;
            default:
                return <Box />;
        }
    };

    return (
        <Box
            flexGrow={1}
            borderStyle="single"
            borderColor={focused ? colors.amber : colors.dim}
            marginLeft={0}
            flexDirection="column"
        >
            <Box paddingX={2} paddingY={1}>
                <Text bold color={colors.amber}>
                    {breadcrumb || 'Content'}
                </Text>
            </Box>
            <Box flexGrow={1} paddingY={1} paddingX={2} flexDirection="column">
                {toast ? (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        durationMs={2000}
                        onDismiss={onDismissToast}
                    />
                ) : null}
                {renderScreen()}
            </Box>
            <StatusBar hint={keyboardHint} />
        </Box>
    );
}
