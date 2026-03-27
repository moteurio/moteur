import { confirm, isCancel } from '@clack/prompts';
import { cliRegistry } from '../registry.js';
import { getClientOrThrow, getProjectId } from '../config.js';

function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'medium'
        });
    } catch {
        return iso;
    }
}

function formatEvent(e: {
    timestamp: string;
    userName: string;
    action: string;
    resourceType: string;
    resourceId: string;
    fieldPath?: string;
}): string {
    const time = formatTimestamp(e.timestamp);
    const what = e.fieldPath
        ? `${e.resourceType}/${e.resourceId}#${e.fieldPath}`
        : `${e.resourceType}/${e.resourceId}`;
    return `  ${time}  ${e.userName}  ${e.action}  ${what}`;
}

async function fetchPage(
    client: Awaited<ReturnType<typeof getClientOrThrow>>,
    projectId: string | undefined,
    limit: number,
    before?: string
) {
    if (projectId) {
        return client.projects.activity.list(projectId, { limit, before });
    }
    return client.activity.list({ limit, before });
}

export async function activityListCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = await getProjectId(args);
    const limit =
        typeof args.limit === 'number'
            ? args.limit
            : typeof args.limit === 'string'
              ? parseInt(args.limit, 10) || 20
              : 20;
    let before = args.before as string | undefined;
    let page = await fetchPage(client, projectId, limit, before);
    let events = page.events ?? [];
    const allEvents: typeof events = [];

    if (args.json) {
        // JSON: fetch all pages if no before (single page) or output paginated
        while (events.length > 0) {
            allEvents.push(...events);
            if (!page.nextBefore) break;
            before = page.nextBefore;
            page = await fetchPage(client, projectId, limit, before);
            events = page.events ?? [];
        }
        console.log(JSON.stringify({ events: allEvents, nextBefore: page.nextBefore }, null, 2));
        return;
    }

    if (!events.length) {
        console.log('  No recent activity.');
        return;
    }

    const isTty = args.isTty === true;
    console.log('  Latest activity (newest first):\n');

    while (true) {
        for (const e of events) {
            console.log(
                formatEvent({
                    timestamp: e.timestamp,
                    userName: e.userName ?? e.userId ?? '?',
                    action: e.action,
                    resourceType: e.resourceType,
                    resourceId: e.resourceId,
                    fieldPath: e.fieldPath
                })
            );
        }

        if (!page.nextBefore || args.quiet) break;
        if (!isTty) {
            console.log('\n  More: moteur activity list --before=' + page.nextBefore);
            break;
        }
        const loadMore = await confirm({
            message: 'Load more?',
            initialValue: false
        });
        if (isCancel(loadMore) || !loadMore) break;
        before = page.nextBefore;
        page = await fetchPage(client, projectId, limit, before);
        events = page.events ?? [];
        if (!events.length) break;
    }
}

cliRegistry.register('activity', {
    name: '',
    description: 'Show latest activity (alias: logs, tail)',
    action: activityListCommand
});
cliRegistry.register('activity', {
    name: 'list',
    description: 'Show latest activity',
    action: activityListCommand
});
cliRegistry.register('logs', {
    name: '',
    description: 'Show latest activity',
    action: activityListCommand
});
cliRegistry.register('tail', {
    name: '',
    description: 'Show latest activity',
    action: activityListCommand
});
