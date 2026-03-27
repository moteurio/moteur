import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import type { MoteurClient } from '../types.js';

export interface ScreenProjectProps {
    projectLabel: string;
    projectId: string | null;
    detail: Record<string, unknown> | null;
    client?: MoteurClient;
}

interface ProjectStats {
    pages?: number;
    models?: number;
    templates?: number;
    structures?: number;
    layouts?: number;
    forms?: number;
    navigations?: number;
    webhooks?: number;
    recentActivity?: Array<{ action?: string; resourceType?: string; timestamp?: string }>;
}

function StatRow({ label, count }: { label: string; count?: number }) {
    return (
        <Box>
            <Box width={16}>
                <Text color={colors.dim}>{label}</Text>
            </Box>
            <Text color={colors.bright} bold>
                {count ?? '—'}
            </Text>
        </Box>
    );
}

export function ScreenProject({
    projectLabel,
    projectId,
    detail,
    client
}: ScreenProjectProps): React.ReactElement | null {
    const [stats, setStats] = useState<ProjectStats>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!projectId || !client || detail) return;
        setLoading(true);
        const pid = projectId;
        const p = client.forProject(pid);
        Promise.allSettled([
            p.pages.list().then(r => (r.pages ?? []).length),
            p.models.list().then(r => (r.models ?? []).length),
            p.templates.list().then(r => (r.templates ?? []).length),
            p.structures.list().then(r => (r.structures ?? []).length),
            p.layouts.list().then(r => (r.layouts ?? []).length),
            p.forms.list().then(r => (r.forms ?? []).length),
            p.navigations.list().then(r => (r.navigations ?? []).length),
            p.webhooks.list().then(r => (r.webhooks ?? []).length),
            client.activity
                .list({ limit: 5 })
                .then(
                    r =>
                        (
                            r as {
                                events?: Array<{
                                    action?: string;
                                    resourceType?: string;
                                    timestamp?: string;
                                }>;
                            }
                        ).events ?? []
                )
        ]).then(
            ([pages, models, templates, structures, layouts, forms, navs, webhooks, activity]) => {
                setStats({
                    pages: pages.status === 'fulfilled' ? (pages.value as number) : undefined,
                    models: models.status === 'fulfilled' ? (models.value as number) : undefined,
                    templates:
                        templates.status === 'fulfilled' ? (templates.value as number) : undefined,
                    structures:
                        structures.status === 'fulfilled'
                            ? (structures.value as number)
                            : undefined,
                    layouts: layouts.status === 'fulfilled' ? (layouts.value as number) : undefined,
                    forms: forms.status === 'fulfilled' ? (forms.value as number) : undefined,
                    navigations: navs.status === 'fulfilled' ? (navs.value as number) : undefined,
                    webhooks:
                        webhooks.status === 'fulfilled' ? (webhooks.value as number) : undefined,
                    recentActivity:
                        activity.status === 'fulfilled'
                            ? (activity.value as ProjectStats['recentActivity'])
                            : undefined
                });
                setLoading(false);
            }
        );
    }, [projectId, client, detail]);

    if (detail) return null;

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box
                borderStyle="single"
                borderColor={colors.amber}
                paddingX={2}
                paddingY={1}
                flexDirection="column"
            >
                <Text bold color={colors.amber}>
                    {projectLabel || (projectId ?? '—')}
                </Text>
                <Text color={colors.dim}>ID: {projectId ?? '—'}</Text>
            </Box>

            {loading && (
                <Box marginTop={1}>
                    <Text color={colors.teal}>Loading project stats…</Text>
                </Box>
            )}

            {!loading && projectId && (
                <>
                    <Box marginTop={1} flexDirection="column">
                        <Text bold color={colors.bright}>
                            Content
                        </Text>
                        <StatRow label="Pages" count={stats.pages} />
                        <StatRow label="Navigations" count={stats.navigations} />
                        <StatRow label="Layouts" count={stats.layouts} />
                    </Box>

                    <Box marginTop={1} flexDirection="column">
                        <Text bold color={colors.bright}>
                            Schemas
                        </Text>
                        <StatRow label="Models" count={stats.models} />
                        <StatRow label="Templates" count={stats.templates} />
                        <StatRow label="Structures" count={stats.structures} />
                        <StatRow label="Forms" count={stats.forms} />
                    </Box>

                    <Box marginTop={1} flexDirection="column">
                        <Text bold color={colors.bright}>
                            Configuration
                        </Text>
                        <StatRow label="Webhooks" count={stats.webhooks} />
                    </Box>

                    {stats.recentActivity && stats.recentActivity.length > 0 && (
                        <Box marginTop={1} flexDirection="column">
                            <Text bold color={colors.bright}>
                                Recent Activity
                            </Text>
                            {stats.recentActivity.map((ev, i) => (
                                <Box key={i}>
                                    <Text color={colors.dim}>
                                        {ev.action} {ev.resourceType}
                                        {ev.timestamp
                                            ? `  ${new Date(ev.timestamp).toLocaleString()}`
                                            : ''}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}
