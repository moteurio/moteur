/**
 * Server news: what an operator wants to hear about without looking. New accounts (how they came,
 * who invited them), new projects (who made them, in which workspace), new team workspaces and
 * accounts deleted by their owners. Kept 90 days for the Operator screen ("new since you last
 * looked"), and emailed to each operator as they chose (./operators.ts): each one as it happens
 * (the default; news within half a minute goes in one email), a daily summary when something
 * happened, or nothing.
 *
 * Not news: copies of the demo (someone trying it) and the demo project itself, and personal
 * workspaces (made with someone's first project, which is the news). Data copied into place (seeds,
 * a sandbox's generated data, the CLI's accounts) never passes through here.
 */
import { randomUUID } from 'node:crypto';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import type { User } from '@moteurio/types/User.js';
import type { Workspace } from '@moteurio/types/Workspace.js';
import { emailUnavailable, sendTemplateEmail } from './emailNotifier.js';
import { markOperatorNewsSent, newsReaders } from './operators.js';
import { getDemoProjectId, loadProject } from './projects.js';
import { getUserById } from './users.js';
import { getWorkspace, workspaceOf } from './workspaces.js';
import { onEvent } from './utils/eventBus.js';
import { privateStatePath, readPrivateState, writePrivateState } from './utils/privateStore.js';
import { studioUrl } from './utils/studioUrl.js';

/** One new thing, as it was when it happened (names may change or go later). */
export type ServerNewsItem = { id: string; at: string } & (
    | {
          kind: 'account';
          userId: string;
          email: string;
          name?: string;
          /** How they made it; `added` by someone else (an operator, a script). */
          method: 'email' | 'provider' | 'invite' | 'added';
          /** The sign-in provider (`github`, `google`…), for `provider`. */
          provider?: string;
          /** For `invite`: who invited them, and to what (a project or a workspace's name). */
          invitedBy?: string;
          invitedTo?: string;
          /** The site page they came from (`/for/agencies`). */
          from?: string;
      }
    | {
          kind: 'project';
          projectId: string;
          label: string;
          userId: string;
          by: string;
          /** Its workspace's name; `personal` when it is the maker's own. */
          workspace?: string;
          personal?: boolean;
      }
    | { kind: 'workspace'; workspaceId: string; name: string; userId: string; by: string }
    | { kind: 'account-deleted'; userId: string; email: string }
);

/** What an item is without its id and time: what callers record. */
export type ServerNewsInput = ServerNewsItem extends infer T
    ? T extends ServerNewsItem
        ? Omit<T, 'id' | 'at'>
        : never
    : never;

type State = { items: ServerNewsItem[] };

const KEEP_DAYS = 90;
const KEEP_MAX = 1000;
/** Each-one emails wait this long, so a burst (an import, a team signing up) is one email. */
const GATHER_MS = 30_000;
const DAY_MS = 24 * 3600_000;
/** At most this many lines in one email; the rest is counted. */
export const NEWS_EMAIL_LINES = 25;

const file = () => privateStatePath('server-news.json');

function readItems(): ServerNewsItem[] {
    const state = readPrivateState<State>(file(), { items: [] });
    return Array.isArray(state.items) ? state.items : [];
}

/** What's new, oldest first; only what came after `since` when given. */
export function listServerNews(since?: string): ServerNewsItem[] {
    const items = readItems();
    return since ? items.filter(i => i.at > since) : items;
}

/** Keeps a new thing, and has the each-one emails go out shortly. */
export function recordServerNews(input: ServerNewsInput, at = new Date()): ServerNewsItem {
    const item = { ...input, id: randomUUID(), at: at.toISOString() } as ServerNewsItem;
    const oldest = new Date(at.getTime() - KEEP_DAYS * DAY_MS).toISOString();
    const items = [...readItems().filter(i => i.at >= oldest), item].slice(-KEEP_MAX);
    writePrivateState(file(), { items } satisfies State);
    if (timer) gatherSoon();
    return item;
}

/** A person as a line names them: their name, else their email. */
const nameOf = (user: Pick<User, 'name' | 'email' | 'id'> | undefined, fallback = 'Someone') =>
    user?.name?.trim() || user?.email || fallback;

function isDemo(project: ProjectSchema): boolean {
    return !!project.demo || project.id === getDemoProjectId();
}

export function accountNews(user: User, performedBy?: User): ServerNewsInput {
    const signup = user.signup;
    const method = signup?.method ?? 'added';
    const inviter = signup?.invite?.by ? getUserById(signup.invite.by) : undefined;
    const to = signup?.invite?.projectId
        ? loadProject(signup.invite.projectId)?.label || signup.invite.projectId
        : signup?.invite?.workspaceId
          ? getWorkspace(signup.invite.workspaceId)?.name
          : undefined;
    return {
        kind: 'account',
        userId: user.id,
        email: user.email,
        ...(user.name?.trim() && { name: user.name.trim() }),
        method,
        ...(method === 'provider' &&
            user.auth &&
            Object.keys(user.auth)[0] && { provider: Object.keys(user.auth)[0] }),
        ...(method === 'invite' && inviter && { invitedBy: nameOf(inviter) }),
        ...(method === 'added' && performedBy && { invitedBy: nameOf(performedBy) }),
        ...(to && { invitedTo: to }),
        ...(signup?.from && { from: signup.from })
    };
}

export function projectNews(project: ProjectSchema, user: User): ServerNewsInput | null {
    if (isDemo(project)) return null;
    const workspace = workspaceOf(project);
    return {
        kind: 'project',
        projectId: project.id,
        label: project.label || project.id,
        userId: user.id,
        by: nameOf(user),
        ...(workspace &&
            (workspace.personal?.userId === user.id
                ? { personal: true }
                : { workspace: workspace.name }))
    };
}

export function workspaceNews(workspace: Workspace, user: User): ServerNewsInput | null {
    if (workspace.personal) return null;
    return {
        kind: 'workspace',
        workspaceId: workspace.id,
        name: workspace.name,
        userId: user.id,
        by: nameOf(user)
    };
}

function keep(input: ServerNewsInput | null): void {
    if (!input) return;
    try {
        recordServerNews(input);
    } catch (err) {
        console.error(
            '[moteur] Server news could not be kept:',
            err instanceof Error ? err.message : err
        );
    }
}

let listening = false;

/** Listens for new accounts, projects and workspaces (once per process). */
export function listenForServerNews(): void {
    if (listening) return;
    listening = true;
    onEvent('user.afterCreate', async ({ user, performedBy }) =>
        keep(accountNews(user, performedBy))
    );
    onEvent('project.afterCreate', async ({ project, user }) => keep(projectNews(project, user)));
    onEvent('workspace.afterCreate', async ({ workspace, user }) =>
        keep(workspaceNews(workspace, user))
    );
    onEvent('auth.account.deleted', async ({ userId, email }) =>
        keep({ kind: 'account-deleted', userId, email })
    );
}

/**
 * Emails what's due: to each-one readers, whatever came since their last email; to daily readers,
 * once a day, the day's news when there was some. Returns the emails sent. A failed email is
 * tried again next time; nothing is marked sent while mail can't go out.
 */
export async function sendServerNews(now = new Date()): Promise<number> {
    if (emailUnavailable()) return 0;
    const readers = newsReaders();
    if (!readers.length) return 0;
    const items = readItems();
    const studio = studioUrl();
    let sent = 0;
    for (const reader of readers) {
        const daily = reader.mode === 'daily';
        if (daily && now.getTime() - Date.parse(reader.sentUntil) < DAY_MS) continue;
        const due = items.filter(i => i.at > reader.sentUntil && i.at <= now.toISOString());
        if (due.length) {
            try {
                await sendTemplateEmail('server-news', [reader.email], {
                    daily,
                    items: due.slice(-NEWS_EMAIL_LINES).map(({ id: _id, ...rest }) => rest),
                    more: Math.max(0, due.length - NEWS_EMAIL_LINES),
                    ...(studio && { url: `${studio}/operator` })
                });
                sent++;
            } catch (err) {
                console.error(
                    `[moteur] Server news for ${reader.email} could not be sent:`,
                    err instanceof Error ? err.message : err
                );
                continue;
            }
        }
        // Mark news as sent. A daily reader is marked up to now even when nothing happened, so the
        // next summary starts a new day.
        if (due.length || daily)
            markOperatorNewsSent(reader.id, daily ? now.toISOString() : due.at(-1)!.at);
    }
    return sent;
}

let timer: ReturnType<typeof globalThis.setInterval> | undefined;
let gathering: ReturnType<typeof globalThis.setTimeout> | undefined;

const run = () =>
    void sendServerNews().catch(err =>
        console.error('[moteur] Server news failed:', err instanceof Error ? err.message : err)
    );

function gatherSoon(): void {
    if (gathering) return;
    gathering = globalThis.setTimeout(() => {
        gathering = undefined;
        run();
    }, GATHER_MS);
    gathering.unref?.();
}

/**
 * Listens, and emails what's due: half a minute after something new, and every `intervalMs`
 * (15 minutes) for daily summaries and what a restart left unsent.
 */
export function startServerNews(intervalMs = 15 * 60_000): void {
    stopServerNews();
    listenForServerNews();
    timer = globalThis.setInterval(run, intervalMs);
    timer.unref?.();
    gatherSoon();
}

export function stopServerNews(): void {
    if (timer) globalThis.clearInterval(timer);
    if (gathering) globalThis.clearTimeout(gathering);
    timer = undefined;
    gathering = undefined;
}
