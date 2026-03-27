/**
 * Storage key convention for project-scoped data.
 * All keys are relative to the project root.
 * - Content (Git tracked): project.json, models/, layouts/, pages/, etc.
 * - Workspace (gitignored): .moteur/ — comments, activity, radar, reviews, schedules, etc.
 * - User data (gitignored): user-data/ — form submissions, etc.
 */
export const PROJECT_KEY = 'project.json';

export const ASSETS_KEY = 'assets.json';

export const API_COLLECTIONS_KEY = 'api-collections.json';

/** Workspace store — gitignored, not committed. Snapshot to orphan branch. */
const WORKSPACE = '.moteur/';
export const ACTIVITY_KEY = `${WORKSPACE}activity.json`;
/** AI call audit (prompts/responses on disk; API redacts for non-operators). */
export const AI_AUDIT_KEY = `${WORKSPACE}ai-audit.json`;
export const COMMENTS_KEY = `${WORKSPACE}comments.json`;
export const REVIEWS_KEY = `${WORKSPACE}reviews.json`;
export const NOTIFICATIONS_KEY = `${WORKSPACE}notifications.json`;
export const WEBHOOK_LOG_KEY = `${WORKSPACE}webhook-log.json`;

export function modelKey(modelId: string): string {
    return `models/${modelId}/model.json`;
}

export function modelListPrefix(): string {
    return 'models/';
}

export function entryKey(modelId: string, entryId: string): string {
    return `models/${modelId}/entries/${entryId}/entry.json`;
}

export function entryListPrefix(modelId: string): string {
    return `models/${modelId}/entries/`;
}

export function layoutKey(layoutId: string): string {
    return `layouts/${layoutId}/layout.json`;
}

export function layoutListPrefix(): string {
    return 'layouts/';
}

export function structureKey(structureId: string): string {
    return `structures/${structureId}/structure.json`;
}

export function structureListPrefix(): string {
    return 'structures/';
}

export function templateKey(templateId: string): string {
    return `templates/${templateId}.json`;
}

export function templateListPrefix(): string {
    return 'templates/';
}

export function pageKey(pageId: string): string {
    return `pages/${pageId}.json`;
}

export function pageListPrefix(): string {
    return 'pages/';
}

export const NAVIGATIONS_KEY = 'navigations.json';

export const WEBHOOKS_KEY = 'webhooks.json';

export function formKey(formId: string): string {
    return `forms/${formId}/form.json`;
}

export function formListPrefix(): string {
    return 'forms/';
}

/** User data store — gitignored. Form submissions, etc. */
const USERDATA = 'user-data/';
export function submissionKey(formId: string, submissionId: string): string {
    return `${USERDATA}forms/${formId}/${submissionId}.json`;
}

export function submissionListPrefix(formId: string): string {
    return `${USERDATA}forms/${formId}/`;
}

/** Schedules live in workspace (operational, not content). */
export function scheduleKey(scheduleId: string): string {
    return `${WORKSPACE}schedules/${scheduleId}.json`;
}

export function scheduleListPrefix(): string {
    return `${WORKSPACE}schedules/`;
}

/** Radar violations (derived data, in workspace). */
export const RADAR_KEY = `${WORKSPACE}radar.json`;

/** Snapshot scheduler config: { enabled: boolean, cron?: string }. */
export const SNAPSHOT_SCHEDULE_KEY = `${WORKSPACE}snapshot-schedule.json`;
