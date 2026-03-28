import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { createMoteurAdminClient } from '@moteurio/client';
import { EntryEditor } from './EntryEditor.js';
import { EntityEditor } from './EntityEditor.js';
import type { FieldSchema } from './EntityEditor.js';
import { Sidebar } from './Sidebar.js';
import { ContentPanel } from './ContentPanel.js';
import { StatusLine } from './StatusLine.js';
import { Divider } from './Divider.js';
import { Splash, LogoAndTagline } from './Splash.js';
import { LoadingSpinner } from './LoadingSpinner.js';
import { Onboarding } from './Onboarding.js';
import type { OnboardingState } from './Onboarding.js';
import { colors } from './theme.js';
import { MAIN_MENU, getSubmenu, LIST_PAGE_SIZE } from './types.js';
import type { CliConfig } from '../config.js';
import type { Level, Screen } from './types.js';
import { useListData, isAuthError } from './useListData.js';
import { usePresence } from './usePresence.js';

type MoteurClient = import('./types.js').MoteurClient;

interface AppProps {
    client: MoteurClient;
    projectId: string | null;
    projectLabel: string;
    apiUrl: string;
    loggedIn: boolean;
    token?: string | null;
    onLogout: () => void | Promise<void>;
    onSessionExpired?: () => void;
    saveConfig?: (config: CliConfig) => void | Promise<void>;
    loadConfig?: () => CliConfig | Promise<CliConfig>;
    onLoginSuccess?: () => void | Promise<void>;
    firstRun?: boolean;
    onboardingState?: OnboardingState | null;
    onOnboardingStateChange?: (state: OnboardingState) => void;
}

interface EntryEditorState {
    modelId: string;
    modelLabel: string;
    entryId: string;
    entryLabel: string;
}

function formatLoginError(err: unknown): string {
    const e = err as Error & { status?: number; response?: { data?: unknown } };
    const msg = e?.message?.trim();
    const status = e?.status;
    const data = e?.response?.data as { error?: string; message?: string } | undefined;
    const bodyMsg = (data?.error ?? data?.message)?.trim();
    if (bodyMsg) return bodyMsg;
    if (msg) return msg;
    if (status === 401) return 'Invalid email or password.';
    if (status === 403) return 'Access denied.';
    if (status) return `Server returned HTTP ${status}.`;
    return 'Invalid credentials or server unreachable.';
}

export function App({
    client,
    projectId,
    projectLabel,
    apiUrl,
    loggedIn,
    token,
    onLogout,
    onSessionExpired,
    saveConfig,
    loadConfig,
    onLoginSuccess,
    firstRun,
    onboardingState,
    onOnboardingStateChange
}: AppProps) {
    const { exit } = useApp();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId);
    const [selectedProjectLabel, setSelectedProjectLabel] = useState<string>(projectLabel);
    const [level, setLevel] = useState<Level>('main');
    const [menuIndex, setMenuIndex] = useState(0);
    const [listCursor, setListCursor] = useState(0);
    const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
    const [entryEditor, setEntryEditor] = useState<EntryEditorState | null>(null);
    const [entityEditor, setEntityEditor] = useState<{
        screen: Screen;
        entityId: string;
        entityLabel: string;
    } | null>(null);
    const [whoami, setWhoami] = useState<Record<string, unknown> | null>(null);
    const [currentUserDisplay, setCurrentUserDisplay] = useState<string>('');
    const [sidebarFocused, setSidebarFocused] = useState(true);
    const [filter, setFilter] = useState('');
    const [filterMode, setFilterMode] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showBulkMenu, setShowBulkMenu] = useState(false);
    const [bulkConfirm, setBulkConfirm] = useState<'delete' | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [loginApiUrl, setLoginApiUrl] = useState(apiUrl);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginFocusIndex, setLoginFocusIndex] = useState(0);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [loginLoading, setLoginLoading] = useState(false);
    const [toast, setToast] = useState<{
        message: string;
        type: 'success' | 'error' | 'info';
    } | null>(null);
    const [splashVisible, setSplashVisible] = useState(true);

    const hasProject = !!selectedProjectId;
    const effectiveProjectId = selectedProjectId;
    const effectiveProjectLabel = selectedProjectLabel;
    const submenu = getSubmenu(level);
    const isMain = level === 'main';
    const currentScreen: Screen = isMain ? 'project' : (submenu[menuIndex]?.screen ?? 'project');
    const presenceScreenId = entryEditor
        ? `entry:${effectiveProjectId}:${entryEditor.modelId}:${entryEditor.entryId}`
        : effectiveProjectId
          ? `atelier:${currentScreen}`
          : null;
    // Use latest token (e.g. after login or when selecting project) so Presence connects whenever we're inside a project
    const [configToken, setConfigToken] = useState<string | null>(null);
    useEffect(() => {
        if (!loadConfig) return;
        Promise.resolve(loadConfig()).then(c => setConfigToken(c?.token ?? null));
    }, [loadConfig]);
    const effectiveToken = token ?? configToken ?? null;
    const {
        users: presenceUsers,
        connected: presenceConnected,
        error: presenceError
    } = usePresence(apiUrl, effectiveToken, effectiveProjectId, presenceScreenId);

    const { listItems, loading, error, loadList } = useListData({
        client,
        projectId: effectiveProjectId,
        screen: effectiveProjectId ? currentScreen : 'project',
        selectedModelId,
        selectedFormId,
        loggedIn,
        onUnauthorized: onSessionExpired
    });

    const filteredItems = filter.trim()
        ? listItems.filter(it => it.label.toLowerCase().includes(filter.toLowerCase().trim()))
        : listItems;
    const currentListItem = filteredItems[listCursor] ?? null;
    const hasMore = listItems.length >= LIST_PAGE_SIZE;

    useEffect(() => {
        setListCursor(c => (filteredItems.length ? Math.min(c, filteredItems.length - 1) : 0));
    }, [filteredItems.length]);

    useEffect(() => {
        const t = setTimeout(() => setSplashVisible(false), 1500);
        return () => clearTimeout(t);
    }, []);

    const doLogin = useCallback(() => {
        if (!saveConfig || !loadConfig || !onLoginSuccess) return;
        const baseURL = loginApiUrl.trim().replace(/\/+$/, '') || 'http://localhost:3000';
        const email = loginEmail.trim();
        const password = loginPassword;
        if (!email || !password) {
            setLoginError('Email and password are required.');
            return;
        }
        setLoginError(null);
        setLoginLoading(true);
        const loginClient = createMoteurAdminClient({ baseURL });
        loginClient.auth
            .login(email, password)
            .then(async result => {
                const prev = await Promise.resolve(loadConfig!());
                await Promise.resolve(
                    saveConfig!({ ...prev, apiUrl: baseURL, token: result.token })
                );
                await Promise.resolve(onLoginSuccess!());
            })
            .catch((err: unknown) => {
                setLoginError(formatLoginError(err));
                setLoginLoading(false);
            });
    }, [saveConfig, loadConfig, onLoginSuccess, loginApiUrl, loginEmail, loginPassword]);

    useInput(async (input, key) => {
        if (!loggedIn && saveConfig && onLoginSuccess) {
            if (input === 'q' || input === 'Q' || key.escape) {
                exit();
                return;
            }
            if (key.upArrow) {
                setLoginFocusIndex(i => Math.max(0, i - 1));
                return;
            }
            if (key.downArrow) {
                setLoginFocusIndex(i => Math.min(2, i + 1));
                return;
            }
            if (key.return) {
                if (loginFocusIndex < 2) setLoginFocusIndex(i => i + 1);
                else doLogin();
                return;
            }
            return;
        }
        if (entryEditor) return;
        if (bulkConfirm === 'delete') {
            if (input === 'y' || input === 'Y') {
                if (effectiveProjectId && currentScreen === 'entries' && selectedModelId) {
                    let failed = 0;
                    for (const id of selectedIds) {
                        try {
                            await client
                                .forProject(effectiveProjectId)
                                .entries.delete(selectedModelId, id);
                        } catch {
                            failed++;
                        }
                    }
                    setSelectedIds(new Set());
                    loadList();
                    setToast(
                        failed === 0
                            ? {
                                  message: `${selectedIds.size} entr${selectedIds.size === 1 ? 'y' : 'ies'} deleted`,
                                  type: 'success'
                              }
                            : {
                                  message: `${failed} of ${selectedIds.size} failed to delete`,
                                  type: 'error'
                              }
                    );
                }
                setBulkConfirm(null);
                setShowBulkMenu(false);
            } else if (key.escape) {
                setBulkConfirm(null);
            }
            return;
        }
        if (showBulkMenu) {
            if (key.escape) {
                setShowBulkMenu(false);
                return;
            }
            if (input === '1') {
                setBulkConfirm('delete');
                return;
            }
            if (input === '2') {
                const arr = filteredItems.filter(it => selectedIds.has(it.id));
                process.stdout.write(JSON.stringify(arr, null, 2) + '\n');
                setSelectedIds(new Set());
                setShowBulkMenu(false);
                return;
            }
            return;
        }
        const isBack = key.escape || key.leftArrow;
        if (isBack || input === 'q') {
            if (input === 'q') {
                exit();
                return;
            }
            if (isBack) {
                if (filterMode) {
                    setFilterMode(false);
                    setFilter('');
                    return;
                }
                if (bulkConfirm) {
                    setBulkConfirm(null);
                    return;
                }
                if (showBulkMenu) {
                    setShowBulkMenu(false);
                    return;
                }
                if (confirmDeleteId) {
                    setConfirmDeleteId(null);
                    return;
                }
                if (detail) {
                    setDetail(null);
                    return;
                }
                if (currentScreen === 'entries' && selectedModelId) {
                    setSelectedModelId(null);
                    return;
                }
                if (currentScreen === 'submissions' && selectedFormId) {
                    setSelectedFormId(null);
                    return;
                }
                if (!isMain) {
                    if (sidebarFocused) {
                        setLevel('main');
                        setMenuIndex(0);
                        setDetail(null);
                        setSelectedModelId(null);
                        setSelectedIds(new Set());
                    } else {
                        setSidebarFocused(true);
                    }
                }
            }
            return;
        }
        if (input === '?') {
            setShowHelp(h => !h);
            return;
        }
        if (input === '/' && !sidebarFocused && filteredItems.length >= 0) {
            setFilterMode(true);
            return;
        }
        if (filterMode) {
            if (key.escape) {
                setFilterMode(false);
                setFilter('');
                return;
            }
            if (key.return) {
                setFilterMode(false);
                return;
            }
            if (key.backspace) {
                setFilter(f => f.slice(0, -1));
                return;
            }
            if (input && input.length === 1 && !key.ctrl && !key.meta) {
                setFilter(f => f + input);
                return;
            }
            return;
        }
        const moveUp = key.upArrow || (key.tab && key.shift);
        const moveDown = key.downArrow || (key.tab && !key.shift);
        if (moveUp) {
            if (!effectiveProjectId && filteredItems.length > 0) {
                setListCursor(c => (c - 1 + filteredItems.length) % filteredItems.length);
                return;
            }
            if (isMain) {
                setMenuIndex(i => (i - 1 + MAIN_MENU.length) % MAIN_MENU.length);
            } else if (sidebarFocused) {
                setListCursor(0);
                setMenuIndex(i => (i - 1 + submenu.length) % submenu.length);
            } else if (filteredItems.length > 0) {
                setListCursor(c => (c - 1 + filteredItems.length) % filteredItems.length);
            }
            return;
        }
        if (moveDown) {
            if (!effectiveProjectId && filteredItems.length > 0) {
                setListCursor(c => (c + 1) % filteredItems.length);
                return;
            }
            if (isMain) {
                setMenuIndex(i => (i + 1) % MAIN_MENU.length);
            } else if (sidebarFocused) {
                setListCursor(0);
                setMenuIndex(i => (i + 1) % submenu.length);
            } else if (filteredItems.length > 0) {
                setListCursor(c => (c + 1) % filteredItems.length);
            }
            return;
        }
        if (input === ' ' && !sidebarFocused && currentListItem && !detail) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(currentListItem.id)) next.delete(currentListItem.id);
                else next.add(currentListItem.id);
                return next;
            });
            return;
        }
        if (
            (input === 'n' || input === 'N') &&
            !sidebarFocused &&
            !detail &&
            effectiveProjectId &&
            !filterMode
        ) {
            const creatableScreens: Screen[] = [
                'entries',
                'pages',
                'models',
                'navigations',
                'templates',
                'structures',
                'forms',
                'webhooks',
                'blocks'
            ];
            if (creatableScreens.includes(currentScreen)) {
                const pid = effectiveProjectId;
                const doCreate = async () => {
                    try {
                        let newId: string | undefined;
                        if (currentScreen === 'entries' && selectedModelId) {
                            const res = await client
                                .forProject(pid)
                                .entries.create(selectedModelId, { data: {} });
                            newId = (res as { entry?: { id?: string } }).entry?.id;
                            if (newId) {
                                setEntryEditor({
                                    modelId: selectedModelId,
                                    modelLabel: selectedModelId,
                                    entryId: newId,
                                    entryLabel: 'New Entry'
                                });
                            }
                        } else if (currentScreen === 'pages') {
                            const res = await client
                                .forProject(pid)
                                .pages.create({ label: 'New Page', slug: '/new-page' });
                            newId = (res as { page?: { id?: string } }).page?.id;
                        } else if (currentScreen === 'models') {
                            const res = await client.forProject(pid).models.create({
                                label: 'New Model',
                                modelType: 'content',
                                fields: {}
                            });
                            newId = (res as { model?: { id?: string } }).model?.id;
                        } else if (currentScreen === 'navigations') {
                            const res = await client
                                .forProject(pid)
                                .navigations.create({ name: 'New Navigation', handle: 'new-nav' });
                            newId = (res as { navigation?: { id?: string } }).navigation?.id;
                        } else if (currentScreen === 'templates') {
                            const res = await client
                                .forProject(pid)
                                .templates.create({ label: 'New Template' });
                            newId = (res as { template?: { id?: string } }).template?.id;
                        } else if (currentScreen === 'structures') {
                            const res = await client
                                .forProject(pid)
                                .structures.create({ label: 'New Structure' });
                            newId = (res as { structure?: { id?: string } }).structure?.id;
                        } else if (currentScreen === 'forms') {
                            const res = await client
                                .forProject(pid)
                                .forms.create({ name: 'New Form' });
                            newId = (res as { form?: { id?: string } }).form?.id;
                        } else if (currentScreen === 'webhooks') {
                            const res = await client.forProject(pid).webhooks.create({
                                name: 'New Webhook',
                                url: 'https://example.com/hook'
                            });
                            newId = (res as { webhook?: { id?: string } }).webhook?.id;
                        } else if (currentScreen === 'blocks') {
                            const res = await client.forProject(pid).blocks.create({
                                label: 'New Block',
                                namespace: 'custom',
                                fields: {}
                            });
                            newId = String((res as { id?: string }).id ?? '');
                        }
                        loadList();
                        if (newId && currentScreen !== 'entries') {
                            setEntityEditor({
                                screen: currentScreen,
                                entityId: newId,
                                entityLabel: 'New'
                            });
                        }
                        setToast({ message: 'Created', type: 'success' });
                    } catch (e) {
                        setToast({
                            message: e instanceof Error ? e.message : 'Create failed',
                            type: 'error'
                        });
                    }
                };
                doCreate();
            }
            return;
        }
        if (detail && effectiveProjectId && !confirmDeleteId) {
            const entityId = String(detail.id);
            if (input === 'e' || input === 'E') {
                const editableScreens: Screen[] = [
                    'pages',
                    'models',
                    'navigations',
                    'templates',
                    'structures',
                    'forms',
                    'webhooks',
                    'blocks'
                ];
                if (editableScreens.includes(currentScreen)) {
                    setEntityEditor({
                        screen: currentScreen,
                        entityId,
                        entityLabel: String(detail.label ?? detail.name ?? entityId)
                    });
                    setDetail(null);
                }
                return;
            }
            if (input === 'p' || input === 'P') {
                const pid = effectiveProjectId;
                if (currentScreen === 'pages') {
                    const currentStatus = String(detail.status ?? 'draft');
                    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
                    client
                        .forProject(pid)
                        .pages.status(entityId, newStatus)
                        .then(() => {
                            setDetail(prev => (prev ? { ...prev, status: newStatus } : prev));
                            loadList();
                            setToast({
                                message: newStatus === 'published' ? 'Published' : 'Unpublished',
                                type: 'success'
                            });
                        })
                        .catch(e =>
                            setToast({
                                message: e instanceof Error ? e.message : 'Status change failed',
                                type: 'error'
                            })
                        );
                } else if (currentScreen === 'entries' && selectedModelId) {
                    const currentStatus = String(detail.status ?? 'draft');
                    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
                    client
                        .forProject(pid)
                        .entries.status(selectedModelId, entityId, newStatus)
                        .then(() => {
                            setDetail(prev => (prev ? { ...prev, status: newStatus } : prev));
                            loadList();
                            setToast({
                                message: newStatus === 'published' ? 'Published' : 'Unpublished',
                                type: 'success'
                            });
                        })
                        .catch(e =>
                            setToast({
                                message: e instanceof Error ? e.message : 'Failed',
                                type: 'error'
                            })
                        );
                }
                return;
            }
            if (input === 'o' || input === 'O') {
                const editorCmd = process.env.EDITOR || process.env.VISUAL || 'notepad';
                const safeScreen = currentScreen.replace(/[^a-z_]/gi, '');
                const tmp = path.join(os.tmpdir(), `moteur-${safeScreen}-${entityId}.json`);
                try {
                    const { _loaded, _loading, ...data } = detail;
                    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
                    spawnSync(editorCmd, [tmp], { stdio: 'inherit', shell: true });
                    const raw = fs.readFileSync(tmp, 'utf-8');
                    const next = JSON.parse(raw) as Record<string, unknown>;
                    fs.unlinkSync(tmp);

                    const doUpdate = async () => {
                        try {
                            const p = client.forProject(effectiveProjectId);
                            if (currentScreen === 'pages') await p.pages.update(entityId, next);
                            else if (currentScreen === 'navigations')
                                await p.navigations.update(entityId, next);
                            else if (currentScreen === 'layouts')
                                await p.layouts.update(entityId, next);
                            else if (currentScreen === 'templates')
                                await p.templates.update(entityId, next);
                            else if (currentScreen === 'structures')
                                await p.structures.update(entityId, next);
                            else if (currentScreen === 'blocks')
                                await p.blocks.update(entityId, next);
                            else if (currentScreen === 'forms')
                                await p.forms.update(entityId, next);
                            else if (currentScreen === 'webhooks')
                                await p.webhooks.update(entityId, next);
                            else if (currentScreen === 'media')
                                await p.assets.update(entityId, next);
                            else if (currentScreen === 'models') {
                                const { id: _id, ...body } = next;
                                await p.models.update(
                                    entityId,
                                    body as { label?: string; fields?: Record<string, unknown> }
                                );
                            }
                            setToast({ message: 'Saved', type: 'success' });
                            loadList();
                            setDetail(null);
                        } catch (e) {
                            setToast({
                                message: e instanceof Error ? e.message : 'Save failed',
                                type: 'error'
                            });
                        }
                    };
                    doUpdate();
                } catch (e) {
                    setToast({
                        message: e instanceof Error ? e.message : 'Editor failed',
                        type: 'error'
                    });
                }
                return;
            }
            if (input === 'd' || input === 'D') {
                setConfirmDeleteId(entityId);
                return;
            }
        }
        if (
            (input === 'd' || input === 'D') &&
            !sidebarFocused &&
            currentListItem &&
            currentScreen === 'entries' &&
            selectedModelId &&
            effectiveProjectId &&
            !detail
        ) {
            setConfirmDeleteId(currentListItem.id);
            return;
        }
        if (confirmDeleteId) {
            const doDelete = async () => {
                try {
                    if (detail) {
                        const eid = confirmDeleteId;
                        const p = client.forProject(effectiveProjectId!);
                        if (currentScreen === 'pages') await p.pages.delete(eid);
                        else if (currentScreen === 'navigations') await p.navigations.delete(eid);
                        else if (currentScreen === 'layouts') await p.layouts.delete(eid);
                        else if (currentScreen === 'templates') await p.templates.delete(eid);
                        else if (currentScreen === 'structures') await p.structures.delete(eid);
                        else if (currentScreen === 'blocks') await p.blocks.delete(eid);
                        else if (currentScreen === 'forms') await p.forms.delete(eid);
                        else if (currentScreen === 'webhooks') await p.webhooks.delete(eid);
                        else if (currentScreen === 'media') await p.assets.delete(eid);
                        else if (currentScreen === 'submissions' && selectedFormId)
                            await p.submissions.delete(selectedFormId, eid);
                        else if (currentScreen === 'blueprints')
                            await client.blueprints.delete('project', eid);
                        else if (currentScreen === 'models') {
                            await p.models.delete(eid);
                        }
                        setToast({ message: 'Deleted', type: 'success' });
                        setDetail(null);
                        setConfirmDeleteId(null);
                        loadList();
                        return;
                    }
                    if (currentScreen === 'entries' && selectedModelId && effectiveProjectId) {
                        await client
                            .forProject(effectiveProjectId)
                            .entries.delete(selectedModelId, confirmDeleteId);
                        setToast({ message: 'Entry deleted', type: 'success' });
                        setConfirmDeleteId(null);
                        loadList();
                        return;
                    }
                } catch {
                    setToast({ message: 'Delete failed', type: 'error' });
                    setConfirmDeleteId(null);
                }
            };
            if (input === 'y' || input === 'Y') {
                doDelete();
            } else if (key.escape) {
                setConfirmDeleteId(null);
            }
            return;
        }
        const isOpen = key.return || key.rightArrow;
        if (isOpen) {
            if (!effectiveProjectId && currentListItem) {
                setSelectedProjectId(currentListItem.id);
                setSelectedProjectLabel(currentListItem.label);
                setListCursor(0);
                return;
            }
            if (isMain) {
                const item = MAIN_MENU[menuIndex];
                if (item.id === 'quit') {
                    exit();
                    return;
                }
                if (item.id === 'account') {
                    setLevel('account');
                    setMenuIndex(0);
                    setSidebarFocused(true);
                    return;
                }
                if (item.id === 'projects') {
                    setSelectedProjectId(null);
                    setSelectedProjectLabel('');
                    setLevel('main');
                    setMenuIndex(0);
                    setListCursor(0);
                    setDetail(null);
                    setSelectedModelId(null);
                    setSelectedFormId(null);
                    setSelectedIds(new Set());
                    return;
                }
                if (!hasProject) return;
                if (item.id === 'content') {
                    setLevel('content');
                    setMenuIndex(0);
                } else if (item.id === 'schemas') {
                    setLevel('schemas');
                    setMenuIndex(0);
                } else if (item.id === 'userdata') {
                    setLevel('userdata');
                    setMenuIndex(0);
                } else if (item.id === 'configuration') {
                    setLevel('configuration');
                    setMenuIndex(0);
                }
                setListCursor(0);
                setDetail(null);
                setSelectedModelId(null);
                setSelectedFormId(null);
                setSelectedIds(new Set());
                setSidebarFocused(true);
                return;
            }
            if (sidebarFocused) {
                if (currentScreen === 'project') {
                    setLevel('main');
                    setMenuIndex(0);
                    return;
                }
                if (currentScreen === 'account_logout') {
                    onLogout();
                    return;
                }
                if (currentScreen === 'account_whoami') {
                    setWhoami({});
                    return;
                }
                setSidebarFocused(false);
                return;
            }
            if (selectedIds.size > 0 && !sidebarFocused) {
                setShowBulkMenu(true);
                return;
            }
            if (currentListItem) {
                const item = currentListItem;
                if (currentScreen === 'models') {
                    setSelectedModelId(item.id);
                } else if (currentScreen === 'entries') {
                    if (!selectedModelId) {
                        setSelectedModelId(item.id);
                        setListCursor(0);
                    } else {
                        setEntryEditor({
                            modelId: selectedModelId,
                            modelLabel: selectedModelId,
                            entryId: item.id,
                            entryLabel: item.label || item.id
                        });
                    }
                } else if (currentScreen === 'submissions') {
                    if (!selectedFormId) {
                        setSelectedFormId(item.id);
                        setListCursor(0);
                    } else {
                        setDetail({ id: item.id, label: item.label });
                    }
                } else if (
                    [
                        'pages',
                        'forms',
                        'media',
                        'navigations',
                        'layouts',
                        'templates',
                        'structures',
                        'blocks',
                        'blueprints',
                        'webhooks'
                    ].includes(currentScreen)
                ) {
                    setDetail({ id: item.id, label: item.label });
                }
            }
        }
    });

    useEffect(() => {
        if (loggedIn) {
            client.auth
                .me()
                .then(({ user }) => {
                    const u = user as unknown as Record<string, unknown> | undefined;
                    if (!u) {
                        setCurrentUserDisplay('—');
                        return;
                    }
                    const email = typeof u.email === 'string' ? u.email : undefined;
                    const name = typeof u.name === 'string' ? u.name : undefined;
                    const username = typeof u.username === 'string' ? u.username : undefined;
                    const id = u.id != null ? String(u.id) : undefined;
                    const display = email ?? name ?? username ?? id;
                    setCurrentUserDisplay(display ?? (typeof u === 'object' ? 'Logged in' : '—'));
                })
                .catch((err: unknown) => {
                    if (isAuthError(err)) onSessionExpired?.();
                    setCurrentUserDisplay('—');
                });
        } else {
            setCurrentUserDisplay('—');
        }
    }, [client, loggedIn, onSessionExpired]);

    useEffect(() => {
        if (currentScreen === 'account_whoami' && loggedIn) {
            client.auth
                .me()
                .then(({ user }) => setWhoami((user as unknown as Record<string, unknown>) ?? {}))
                .catch((err: unknown) => {
                    if (isAuthError(err)) onSessionExpired?.();
                    setWhoami(null);
                });
        } else {
            setWhoami(null);
        }
    }, [currentScreen, loggedIn, client, onSessionExpired]);

    const detailFetchId = useRef<string | null>(null);
    useEffect(() => {
        if (!detail || detail._loaded || !effectiveProjectId) return;
        const entityId = String(detail.id);
        if (detailFetchId.current === entityId) return;
        detailFetchId.current = entityId;

        type Getter = Promise<Record<string, unknown>>;
        const screen = currentScreen;
        let promise: Getter | null = null;
        const p = client.forProject(effectiveProjectId);

        if (screen === 'pages') {
            promise = p.pages
                .get(entityId)
                .then(r => (r as { page?: Record<string, unknown> }).page ?? r);
        } else if (screen === 'navigations') {
            promise = p.navigations
                .get(entityId)
                .then(r => (r as { navigation?: Record<string, unknown> }).navigation ?? r);
        } else if (screen === 'layouts') {
            promise = p.layouts
                .get(entityId)
                .then(r => (r as { layout?: Record<string, unknown> }).layout ?? r);
        } else if (screen === 'templates') {
            promise = p.templates
                .get(entityId)
                .then(r => (r as { template?: Record<string, unknown> }).template ?? r);
        } else if (screen === 'structures') {
            promise = p.structures
                .get(entityId)
                .then(r => (r as { structure?: Record<string, unknown> }).structure ?? r);
        } else if (screen === 'blocks') {
            promise = p.blocks.get(entityId);
        } else if (screen === 'forms') {
            promise = p.forms
                .get(entityId)
                .then(r => (r as { form?: Record<string, unknown> }).form ?? r);
        } else if (screen === 'webhooks') {
            promise = p.webhooks
                .get(entityId)
                .then(r => (r as { webhook?: Record<string, unknown> }).webhook ?? r);
        } else if (screen === 'media') {
            promise = p.assets.get(entityId);
        } else if (screen === 'submissions' && selectedFormId) {
            promise = p.submissions
                .get(selectedFormId, entityId)
                .then(r => (r as { submission?: Record<string, unknown> }).submission ?? r);
        } else if (screen === 'blueprints') {
            promise = client.blueprints.get('project', entityId);
        } else if (screen === 'models') {
            promise = p.models
                .get(entityId)
                .then(r => (r as unknown as { model?: Record<string, unknown> }).model ?? r);
        }

        if (promise) {
            setDetail(prev =>
                prev && String(prev.id) === entityId ? { ...prev, _loading: true } : prev
            );
            promise
                .then(data => {
                    setDetail(prev => {
                        if (!prev || String(prev.id) !== entityId) return prev;
                        return { ...data, id: entityId, _loaded: true };
                    });
                })
                .catch(() => {
                    setDetail(prev => {
                        if (!prev || String(prev.id) !== entityId) return prev;
                        return { ...prev, _loaded: true };
                    });
                });
        }

        return () => {
            detailFetchId.current = null;
        };
    }, [detail, currentScreen, effectiveProjectId, client, selectedFormId]);

    if (entryEditor && effectiveProjectId) {
        return (
            <Box flexDirection="column" padding={1}>
                <Box marginBottom={1}>
                    <Text color={colors.teal} bold>
                        {effectiveProjectLabel || effectiveProjectId}
                    </Text>
                </Box>
                <Box flexGrow={1} borderStyle="round" borderColor={colors.teal} padding={2}>
                    <EntryEditor
                        client={client}
                        projectId={effectiveProjectId}
                        projectLabel={effectiveProjectLabel}
                        modelId={entryEditor.modelId}
                        modelLabel={entryEditor.modelLabel}
                        entryId={entryEditor.entryId}
                        entryLabel={entryEditor.entryLabel}
                        onBack={() => setEntryEditor(null)}
                    />
                </Box>
            </Box>
        );
    }

    if (entityEditor && effectiveProjectId) {
        const { screen, entityId, entityLabel } = entityEditor;
        const pid = effectiveProjectId;
        const p = client.forProject(pid);

        const editorConfigs: Record<
            string,
            {
                fields: FieldSchema[];
                load: () => Promise<Record<string, unknown>>;
                save: (d: Record<string, unknown>) => Promise<void>;
                del?: () => Promise<void>;
            }
        > = {
            pages: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'label', label: 'Label', type: 'text' },
                    { key: 'slug', label: 'Slug', type: 'text' },
                    {
                        key: 'status',
                        label: 'Status',
                        type: 'select',
                        choices: [
                            { value: 'draft', label: 'Draft' },
                            { value: 'published', label: 'Published' }
                        ]
                    },
                    { key: 'templateId', label: 'Template', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' }
                ],
                load: () =>
                    p.pages
                        .get(entityId)
                        .then(r => (r as { page?: Record<string, unknown> }).page ?? r),
                save: d =>
                    p.pages.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.pages.delete(entityId).then(() => {
                        loadList();
                    })
            },
            models: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'label', label: 'Label', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    {
                        key: 'modelType',
                        label: 'Model Type',
                        type: 'select',
                        choices: [
                            { value: 'content', label: 'Content' },
                            { value: 'userData', label: 'User Data' },
                            { value: 'taxonomy', label: 'Taxonomy' },
                            { value: 'settings', label: 'Settings' }
                        ]
                    },
                    { key: 'fields', label: 'Fields', type: 'json' }
                ],
                load: () =>
                    p.models
                        .get(entityId)
                        .then(
                            r => (r as unknown as { model?: Record<string, unknown> }).model ?? r
                        ),
                save: d => {
                    const { id: _id, ...body } = d;
                    return p.models
                        .update(
                            entityId,
                            body as { label?: string; fields?: Record<string, unknown> }
                        )
                        .then(() => {
                            loadList();
                        });
                },
                del: () =>
                    p.models.delete(entityId).then(() => {
                        loadList();
                    })
            },
            templates: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'label', label: 'Label', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    { key: 'fields', label: 'Fields', type: 'json' }
                ],
                load: () =>
                    p.templates
                        .get(entityId)
                        .then(r => (r as { template?: Record<string, unknown> }).template ?? r),
                save: d =>
                    p.templates.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.templates.delete(entityId).then(() => {
                        loadList();
                    })
            },
            structures: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'label', label: 'Label', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    { key: 'fields', label: 'Fields', type: 'json' }
                ],
                load: () =>
                    p.structures
                        .get(entityId)
                        .then(r => (r as { structure?: Record<string, unknown> }).structure ?? r),
                save: d =>
                    p.structures.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.structures.delete(entityId).then(() => {
                        loadList();
                    })
            },
            navigations: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'name', label: 'Name', type: 'text' },
                    { key: 'handle', label: 'Handle', type: 'text' },
                    {
                        key: 'type',
                        label: 'Type',
                        type: 'select',
                        choices: [
                            { value: 'menu', label: 'Menu' },
                            { value: 'sitemap', label: 'Sitemap' },
                            { value: 'custom', label: 'Custom' }
                        ]
                    },
                    { key: 'maxDepth', label: 'Max Depth', type: 'number' }
                ],
                load: () =>
                    p.navigations
                        .get(entityId)
                        .then(r => (r as { navigation?: Record<string, unknown> }).navigation ?? r),
                save: d =>
                    p.navigations.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.navigations.delete(entityId).then(() => {
                        loadList();
                    })
            },
            forms: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'name', label: 'Name', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    {
                        key: 'status',
                        label: 'Status',
                        type: 'select',
                        choices: [
                            { value: 'active', label: 'Active' },
                            { value: 'inactive', label: 'Inactive' }
                        ]
                    },
                    { key: 'submitLabel', label: 'Submit Label', type: 'text' },
                    { key: 'successMessage', label: 'Success Message', type: 'text' },
                    { key: 'fields', label: 'Fields', type: 'json' }
                ],
                load: () =>
                    p.forms
                        .get(entityId)
                        .then(r => (r as { form?: Record<string, unknown> }).form ?? r),
                save: d =>
                    p.forms.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.forms.delete(entityId).then(() => {
                        loadList();
                    })
            },
            webhooks: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'name', label: 'Name', type: 'text' },
                    { key: 'url', label: 'URL', type: 'text' },
                    { key: 'enabled', label: 'Enabled', type: 'boolean' },
                    { key: 'events', label: 'Events', type: 'json' },
                    { key: 'headers', label: 'Headers', type: 'json' }
                ],
                load: () =>
                    p.webhooks
                        .get(entityId)
                        .then(r => (r as { webhook?: Record<string, unknown> }).webhook ?? r),
                save: d =>
                    p.webhooks.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.webhooks.delete(entityId).then(() => {
                        loadList();
                    })
            },
            blocks: {
                fields: [
                    { key: 'id', label: 'ID', type: 'readonly' },
                    { key: 'label', label: 'Label', type: 'text' },
                    { key: 'namespace', label: 'Namespace', type: 'text' },
                    { key: 'category', label: 'Category', type: 'text' },
                    { key: 'description', label: 'Description', type: 'text' },
                    { key: 'fields', label: 'Fields', type: 'json' }
                ],
                load: () => p.blocks.get(entityId),
                save: d =>
                    p.blocks.update(entityId, d).then(() => {
                        loadList();
                    }),
                del: () =>
                    p.blocks.delete(entityId).then(() => {
                        loadList();
                    })
            }
        };

        const config = editorConfigs[screen];
        if (config) {
            const editorTitle = `${effectiveProjectLabel || effectiveProjectId}  ›  ${entityLabel}`;
            return (
                <Box flexDirection="column" padding={1}>
                    <Box flexGrow={1} borderStyle="round" borderColor={colors.teal} padding={2}>
                        <EntityEditor
                            title={editorTitle}
                            fields={config.fields}
                            load={config.load}
                            save={config.save}
                            onDelete={config.del}
                            onBack={() => {
                                setEntityEditor(null);
                            }}
                        />
                    </Box>
                </Box>
            );
        }
        setEntityEditor(null);
    }

    const [showOnboarding, setShowOnboarding] = useState(!!firstRun && !!onboardingState);

    if (splashVisible) {
        return (
            <Box flexDirection="column" minHeight={12} justifyContent="center">
                <Splash
                    version="2026.3.27"
                    tagline="Structured Content Engine"
                    status={undefined}
                />
            </Box>
        );
    }

    if (showOnboarding && onboardingState) {
        return (
            <Onboarding
                state={onboardingState}
                client={client}
                onComplete={() => setShowOnboarding(false)}
                onStateChange={s => onOnboardingStateChange?.(s)}
            />
        );
    }

    if (!loggedIn) {
        const canLoginInApp = !!(saveConfig && loadConfig && onLoginSuccess);
        return (
            <Box
                flexDirection="column"
                padding={2}
                alignItems="center"
                minHeight={16}
                justifyContent="center"
            >
                <LogoAndTagline version="2026.3.27" tagline="Structured Content Engine" />
                <Box flexDirection="column" width={52}>
                    {canLoginInApp ? (
                        <>
                            <Box flexDirection="column" paddingY={1}>
                                <Box>
                                    <Text color={colors.dim}>API URL: </Text>
                                    <TextInput
                                        value={loginApiUrl}
                                        onChange={setLoginApiUrl}
                                        focus={loginFocusIndex === 0}
                                        placeholder="http://localhost:3000"
                                    />
                                </Box>
                                <Box>
                                    <Text color={colors.dim}>Email: </Text>
                                    <TextInput
                                        value={loginEmail}
                                        onChange={setLoginEmail}
                                        focus={loginFocusIndex === 1}
                                        placeholder="you@example.com"
                                    />
                                </Box>
                                <Box>
                                    <Text color={colors.dim}>Password: </Text>
                                    <TextInput
                                        value={loginPassword}
                                        onChange={setLoginPassword}
                                        focus={loginFocusIndex === 2}
                                        placeholder="••••••••"
                                        mask="•"
                                        onSubmit={doLogin}
                                    />
                                </Box>
                            </Box>
                            {loginError && (
                                <Box paddingY={1}>
                                    <Text color={colors.error}>{loginError}</Text>
                                </Box>
                            )}
                            {loginLoading && (
                                <Box paddingY={1}>
                                    <Text color={colors.amber}>Logging in…</Text>
                                </Box>
                            )}
                            <Box paddingY={1}>
                                <Text color={colors.dim}>↑↓ move Enter next/submit Esc/Q quit</Text>
                            </Box>
                        </>
                    ) : (
                        <Box flexDirection="column" paddingY={2} alignItems="center">
                            <Text color={colors.bright}>Not logged in.</Text>
                            <Text color={colors.dim}>Run in a terminal: moteur auth login</Text>
                        </Box>
                    )}
                </Box>
            </Box>
        );
    }

    if (!effectiveProjectId) {
        return (
            <Box flexDirection="column" minHeight={15}>
                <Box
                    borderStyle="single"
                    borderColor={colors.dim}
                    flexDirection="column"
                    flexGrow={1}
                >
                    <Box paddingX={2} paddingY={1}>
                        <Text bold color={colors.amber}>
                            Select a project
                        </Text>
                    </Box>
                    <Box flexGrow={1} paddingX={2} paddingY={1}>
                        {loading && <LoadingSpinner label="Loading projects" />}
                        {error && <Text color={colors.error}>{error}</Text>}
                        {!loading && !error && filteredItems.length === 0 && (
                            <Text color={colors.dim}>No projects.</Text>
                        )}
                        {!loading && !error && filteredItems.length > 0 && (
                            <Box flexDirection="column">
                                {filteredItems.map((item, i) => (
                                    <Box key={item.id}>
                                        <Text
                                            color={i === listCursor ? colors.amber : undefined}
                                            bold={i === listCursor}
                                        >
                                            {i === listCursor ? '> ' : '  '}
                                            {item.label}
                                        </Text>
                                        <Text color={colors.dim}> {item.id}</Text>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                    <Box paddingX={2} paddingY={1}>
                        <Text color={colors.amber}>↑↓ Tab select Enter/→ open Q quit</Text>
                    </Box>
                </Box>
                <StatusLine host={apiUrl} user={currentUserDisplay} project="—" />
            </Box>
        );
    }

    function getKeyboardHint(): string {
        if (entryEditor) return 'Ctrl+S save  Esc/← back  Q quit';
        if (showHelp) return '? close help';
        if (isMain) return '↑↓ Tab navigate  Enter/→ open  ← back  Q quit';
        if (sidebarFocused) return '↑↓ Tab navigate  Enter/→ open  Esc/← back  ? help  Q quit';
        if (detail) return 'E edit  P publish  D delete  O open in $EDITOR  Esc/← back';
        if (currentScreen === 'entries' && selectedModelId && filteredItems.length > 0) {
            return '↑↓ Tab select  Enter open  N new  Space select  D delete  / filter  Esc/← back  ? help  Q quit';
        }
        if (filteredItems.length > 0) {
            return '↑↓ Tab select  Enter open  N new  / filter  Space select  Esc/← back  ? help  Q quit';
        }
        return 'Esc/← back  ? help  Q quit';
    }

    const screenTitles: Record<string, string> = {
        pages: 'Pages',
        navigations: 'Navigations',
        models: 'Models',
        templates: 'Templates',
        structures: 'Structures',
        blocks: 'Blocks',
        blueprints: 'Blueprints',
        layouts: 'Layouts',
        media: 'Media',
        activity: 'Activity',
        forms: 'Forms',
        webhooks: 'Webhooks',
        project_settings: 'Project Settings',
        api_resources: 'API Resources',
        media_settings: 'Media Settings',
        ai_config: 'AI',
        permissions: 'Users & Permissions',
        account_whoami: 'Who am I',
        account_logout: 'Logout'
    };
    let title: string;
    if (currentScreen === 'project') {
        title = isMain ? 'Project' : 'Back';
    } else if (currentScreen === 'entries') {
        title = selectedModelId ? `Entries · ${selectedModelId}` : 'Entries';
    } else if (currentScreen === 'submissions') {
        title = selectedFormId ? `Submissions · ${selectedFormId}` : 'Submissions';
    } else {
        title = screenTitles[currentScreen] ?? '';
    }
    const breadcrumbParts: string[] = [];
    if (effectiveProjectLabel || effectiveProjectId)
        breadcrumbParts.push(String(effectiveProjectLabel || effectiveProjectId));
    if (!isMain && level)
        breadcrumbParts.push(
            level === 'content'
                ? 'Content'
                : level === 'schemas'
                  ? 'Schemas'
                  : level === 'userdata'
                    ? 'User data'
                    : level === 'configuration'
                      ? 'Configuration'
                      : level === 'account'
                        ? 'Account'
                        : ''
        );
    if (title) breadcrumbParts.push(title);
    const breadcrumb = breadcrumbParts.filter(Boolean).join('  ›  ');

    if (showHelp) {
        return (
            <Box flexDirection="column" padding={2} borderStyle="round" borderColor={colors.amber}>
                <Box marginBottom={1}>
                    <Text bold color={colors.amber}>
                        Keyboard Shortcuts
                    </Text>
                </Box>
                <Box flexDirection="column">
                    <Text bold color={colors.bright}>
                        Navigation
                    </Text>
                    <Text color={colors.dim}> ↑↓ / Tab Move cursor up/down</Text>
                    <Text color={colors.dim}> Enter / → Open item or category</Text>
                    <Text color={colors.dim}> Esc / ← Go back</Text>
                    <Text color={colors.dim}> Q Quit</Text>
                </Box>
                <Box flexDirection="column" marginTop={1}>
                    <Text bold color={colors.bright}>
                        List Actions
                    </Text>
                    <Text color={colors.dim}> / Filter list by name</Text>
                    <Text color={colors.dim}> Space Toggle bulk selection</Text>
                    <Text color={colors.dim}> N Create new item</Text>
                </Box>
                <Box flexDirection="column" marginTop={1}>
                    <Text bold color={colors.bright}>
                        Detail / Editor
                    </Text>
                    <Text color={colors.dim}> E Edit item (opens editor)</Text>
                    <Text color={colors.dim}> D Delete item</Text>
                    <Text color={colors.dim}> O Open in $EDITOR (JSON)</Text>
                    <Text color={colors.dim}> P Publish / Unpublish</Text>
                    <Text color={colors.dim}> Ctrl+S Save (in editor)</Text>
                    <Text color={colors.dim}> I Field info (in entry editor)</Text>
                </Box>
                <Box marginTop={1}>
                    <Text color={colors.amber}>Press ? to close</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" minHeight={20}>
            <Box flexDirection="row" flexGrow={1}>
                <Sidebar level={level} menuIndex={menuIndex} focused={sidebarFocused} />
                <ContentPanel
                    focused={!sidebarFocused}
                    breadcrumb={breadcrumb}
                    keyboardHint={getKeyboardHint()}
                    currentScreen={currentScreen}
                    hasProject={hasProject}
                    loggedIn={loggedIn}
                    listItems={listItems}
                    filteredItems={filteredItems}
                    listCursor={listCursor}
                    filter={filter}
                    selectedIds={selectedIds}
                    detail={detail}
                    loading={loading}
                    error={error}
                    hasMore={hasMore}
                    confirmDeleteId={confirmDeleteId}
                    bulkConfirm={bulkConfirm}
                    showBulkMenu={showBulkMenu}
                    whoami={whoami}
                    projectLabel={effectiveProjectLabel}
                    projectId={effectiveProjectId}
                    toast={toast}
                    onDismissToast={() => setToast(null)}
                    client={client}
                />
            </Box>
            <Box flexDirection="column" paddingX={0}>
                <Divider />
                <StatusLine
                    host={apiUrl}
                    user={currentUserDisplay}
                    project={effectiveProjectLabel || effectiveProjectId || '—'}
                    presenceConnected={presenceConnected}
                    presenceCount={presenceUsers.length}
                    presenceError={presenceError}
                />
            </Box>
        </Box>
    );
}
