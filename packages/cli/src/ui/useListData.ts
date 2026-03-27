import { useState, useEffect, useCallback } from 'react';
import type { MoteurClient } from './types.js';
import type { Screen } from './types.js';
import type { ListItem } from './types.js';

export interface UseListDataArgs {
    client: MoteurClient;
    projectId: string | null;
    screen: Screen;
    selectedModelId: string | null;
    selectedFormId: string | null;
    loggedIn: boolean;
    /** Called when API returns 401 or "invalid/expired token" so app can redirect to login */
    onUnauthorized?: () => void;
}

export function isAuthError(e: unknown): boolean {
    const err = e as { status?: number; response?: { status?: number }; message?: string };
    const status = err?.status ?? err?.response?.status;
    if (status === 401) return true;
    const msg = (err?.message ?? '').toLowerCase();
    return msg.includes('expired') || msg.includes('invalid token') || msg.includes('jwt');
}

export interface UseListDataResult {
    listItems: ListItem[];
    loading: boolean;
    error: string | null;
    loadList: () => Promise<void>;
}

export function useListData({
    client,
    projectId,
    screen,
    selectedModelId,
    selectedFormId,
    loggedIn,
    onUnauthorized
}: UseListDataArgs): UseListDataResult {
    const [listItems, setListItems] = useState<ListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadList = useCallback(async () => {
        if (!projectId && screen !== 'account_whoami') {
            if (loggedIn) {
                setLoading(true);
                setError(null);
                try {
                    const { projects } = await client.projects.list();
                    setListItems(
                        (projects ?? []).map((p: { id?: string; label?: string }) => ({
                            id: String(p.id ?? ''),
                            label: String((p as { label?: string }).label ?? p.id ?? '')
                        }))
                    );
                } catch (e) {
                    if (isAuthError(e)) {
                        onUnauthorized?.();
                    }
                    setError(e instanceof Error ? e.message : String(e));
                    setListItems([]);
                } finally {
                    setLoading(false);
                }
            }
            return;
        }
        const placeholderScreens: Screen[] = [
            'project',
            'account_whoami',
            'account_logout',
            'project_settings',
            'api_resources',
            'media_settings',
            'ai_config',
            'permissions'
        ];
        if (placeholderScreens.includes(screen)) {
            return;
        }
        const effectiveProjectId = projectId ?? undefined;
        if (!effectiveProjectId) return;

        const p = client.forProject(effectiveProjectId);

        setLoading(true);
        setError(null);
        try {
            if (screen === 'models') {
                const { models } = await p.models.list();
                setListItems(
                    (models ?? []).map((m: { id?: string; label?: string }) => ({
                        id: String(m.id ?? ''),
                        label: String(m.label ?? m.id ?? '')
                    }))
                );
            } else if (screen === 'entries') {
                if (!selectedModelId) {
                    const { models } = await p.models.list();
                    setListItems(
                        (models ?? []).map((m: { id?: string; label?: string }) => ({
                            id: String(m.id ?? ''),
                            label: String(m.label ?? m.id ?? '')
                        }))
                    );
                } else {
                    const { entries } = await p.entries.list(selectedModelId, { limit: 100 });
                    setListItems(
                        (entries ?? []).map(
                            (e: {
                                id?: string;
                                status?: string;
                                data?: { title?: string; slug?: string };
                            }) => ({
                                id: String(e.id ?? ''),
                                label: String(
                                    (e.data as { title?: string })?.title ??
                                        (e.data as { slug?: string })?.slug ??
                                        e.id ??
                                        ''
                                ),
                                status: e.status
                            })
                        )
                    );
                }
            } else if (screen === 'pages') {
                const { pages } = await p.pages.list();
                setListItems(
                    (pages ?? []).map(
                        (p: { id?: string; label?: string; slug?: string; status?: string }) => ({
                            id: String(p.id ?? ''),
                            label: String(p.label ?? p.slug ?? p.id ?? ''),
                            status: p.status
                        })
                    )
                );
            } else if (screen === 'forms') {
                const { forms } = await p.forms.list();
                setListItems(
                    (forms ?? []).map((f: { id?: string; name?: string }) => ({
                        id: String(f.id ?? ''),
                        label: String((f as { name?: string }).name ?? f.id ?? '')
                    }))
                );
            } else if (screen === 'media') {
                const assets = await p.assets.list();
                setListItems(
                    (Array.isArray(assets) ? assets : []).map(
                        (a: { id?: string; filename?: string }) => ({
                            id: String(a.id ?? ''),
                            label: String((a as { filename?: string }).filename ?? a.id ?? '')
                        })
                    )
                );
            } else if (screen === 'navigations') {
                const { navigations } = await p.navigations.list();
                setListItems(
                    (navigations ?? []).map(
                        (n: { id?: string; name?: string; handle?: string }) => ({
                            id: String(n.id ?? n.handle ?? ''),
                            label: String(n.name ?? n.handle ?? n.id ?? ''),
                            extra: n.handle ? String(n.handle) : undefined
                        })
                    )
                );
            } else if (screen === 'layouts') {
                const { layouts } = await p.layouts.list();
                setListItems(
                    (layouts ?? []).map((l: { id?: string; label?: string }) => ({
                        id: String(l.id ?? ''),
                        label: String(l.label ?? l.id ?? '')
                    }))
                );
            } else if (screen === 'templates') {
                const { templates } = await p.templates.list();
                setListItems(
                    (templates ?? []).map((t: { id?: string; label?: string }) => ({
                        id: String(t.id ?? ''),
                        label: String(t.label ?? t.id ?? '')
                    }))
                );
            } else if (screen === 'structures') {
                const { structures } = await p.structures.list();
                setListItems(
                    (structures ?? []).map((s: { id?: string; label?: string }) => ({
                        id: String(s.id ?? ''),
                        label: String(s.label ?? s.id ?? '')
                    }))
                );
            } else if (screen === 'blocks') {
                const blocks = await p.blocks.list();
                setListItems(
                    (Array.isArray(blocks) ? blocks : []).map(
                        (b: { id?: string; label?: string; namespace?: string }) => ({
                            id: String(b.id ?? ''),
                            label: String(b.label ?? b.id ?? ''),
                            extra: b.namespace ? String(b.namespace) : undefined
                        })
                    )
                );
            } else if (screen === 'blueprints') {
                const { blueprints } = await client.blueprints.list('project');
                setListItems(
                    (blueprints ?? []).map(
                        (bp: { id?: string; label?: string; name?: string }) => ({
                            id: String(bp.id ?? ''),
                            label: String(bp.label ?? bp.name ?? bp.id ?? '')
                        })
                    )
                );
            } else if (screen === 'activity') {
                const result = await client.activity.list({ limit: 50 });
                const events =
                    (
                        result as {
                            events?: {
                                id?: string;
                                action?: string;
                                resourceType?: string;
                                timestamp?: string;
                            }[];
                        }
                    ).events ?? [];
                setListItems(
                    events.map(ev => ({
                        id: ev.timestamp ?? ev.id ?? '',
                        label:
                            [ev.action, ev.resourceType].filter(Boolean).join(' ') ||
                            String(ev.id ?? '')
                    }))
                );
            } else if (screen === 'webhooks') {
                const { webhooks } = await p.webhooks.list();
                const wh = (webhooks ?? []) as { id?: string; name?: string; enabled?: boolean }[];
                setListItems(
                    wh.map(w => ({
                        id: String(w.id ?? ''),
                        label: String(w.name ?? w.id ?? ''),
                        extra: w.enabled === false ? 'disabled' : undefined
                    }))
                );
            } else if (screen === 'submissions') {
                if (!selectedFormId) {
                    const { forms } = await p.forms.list();
                    setListItems(
                        (forms ?? []).map((f: { id?: string; name?: string }) => ({
                            id: String(f.id ?? ''),
                            label: String((f as { name?: string }).name ?? f.id ?? '')
                        }))
                    );
                } else {
                    const { submissions } = await p.submissions.list(selectedFormId);
                    const sub = (submissions ?? []) as { id?: string }[];
                    setListItems(
                        sub.map(s => ({
                            id: String(s.id ?? ''),
                            label: String(s.id ?? '')
                        }))
                    );
                }
            } else {
                setListItems([]);
            }
        } catch (e) {
            if (isAuthError(e)) {
                onUnauthorized?.();
            }
            setError(e instanceof Error ? e.message : String(e));
            setListItems([]);
        } finally {
            setLoading(false);
        }
    }, [client, projectId, screen, selectedModelId, selectedFormId, loggedIn, onUnauthorized]);

    useEffect(() => {
        loadList();
    }, [loadList]);

    return { listItems, loading, error, loadList };
}
