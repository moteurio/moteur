import { safeId } from './idUtils.js';

/**
 * Storage key convention for project-scoped data.
 * All keys are relative to the project root.
 * - Content (Git tracked): project.json, models/, layouts/, pages/, etc.
 * - Project state (gitignored): .moteur/ — comments, activity, radar, reviews, schedules, etc.
 * - User data (gitignored): user-data/ — form submissions, etc.
 */
export const PROJECT_KEY = 'project.json';

export const ASSETS_KEY = 'assets.json';

export const CHANNELS_KEY = 'channels.json';

/** Project state. It is gitignored and not committed, but snapshots save it to an orphan branch. */
const STATE = '.moteur/';
export const ACTIVITY_KEY = `${STATE}activity.json`;
/** AI call audit, with prompts and responses stored on disk. The API redacts them for users who are not operators. */
export const AI_AUDIT_KEY = `${STATE}ai-audit.json`;
export const COMMENTS_KEY = `${STATE}comments.json`;
export const REVIEWS_KEY = `${STATE}reviews.json`;
export const NOTIFICATIONS_KEY = `${STATE}notifications.json`;
export const WEBHOOK_LOG_KEY = `${STATE}webhook-log.json`;

export function modelKey(modelId: string): string {
    return `models/${safeId(modelId)}/model.json`;
}

export function modelListPrefix(): string {
    return 'models/';
}

export function entryKey(modelId: string, entryId: string): string {
    return `models/${safeId(modelId)}/entries/${safeId(entryId)}/entry.json`;
}

export function entryListPrefix(modelId: string): string {
    return `models/${safeId(modelId)}/entries/`;
}

export function layoutKey(layoutId: string): string {
    return `layouts/${safeId(layoutId)}/layout.json`;
}

export function layoutListPrefix(): string {
    return 'layouts/';
}

export function structureKey(structureId: string): string {
    return `structures/${safeId(structureId)}/structure.json`;
}

export function structureListPrefix(): string {
    return 'structures/';
}

export function templateKey(templateId: string): string {
    return `templates/${safeId(templateId)}.json`;
}

export function templateListPrefix(): string {
    return 'templates/';
}

export function pageKey(pageId: string): string {
    return `pages/${safeId(pageId)}.json`;
}

export function pageListPrefix(): string {
    return 'pages/';
}

export const NAVIGATIONS_KEY = 'navigations.json';

export const WEBHOOKS_KEY = 'webhooks.json';

/** Redirects from old addresses to new ones. They are stored in Git alongside the pages. */
export const REDIRECTS_KEY = 'redirects.json';

export function formKey(formId: string): string {
    return `forms/${safeId(formId)}/form.json`;
}

export function formListPrefix(): string {
    return 'forms/';
}

/** User data store, which is gitignored. It holds form submissions and similar data. */
const USERDATA = 'user-data/';
export function submissionKey(formId: string, submissionId: string): string {
    return `${USERDATA}forms/${safeId(formId)}/${safeId(submissionId)}.json`;
}

export function submissionListPrefix(formId: string): string {
    return `${USERDATA}forms/${safeId(formId)}/`;
}

/** Schedules are stored in project state because they are operational data, not content. */
export function scheduleKey(scheduleId: string): string {
    return `${STATE}schedules/${safeId(scheduleId)}.json`;
}

export function scheduleListPrefix(): string {
    return `${STATE}schedules/`;
}

/** Radar violations. They are derived data, so they are stored in project state. */
export const RADAR_KEY = `${STATE}radar.json`;

/** Snapshot scheduler config: { enabled: boolean, cron?: string }. */
export const SNAPSHOT_SCHEDULE_KEY = `${STATE}snapshot-schedule.json`;
