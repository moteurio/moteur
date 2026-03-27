import type { MoteurAdminClient } from '@moteurio/client';

export type MoteurClient = MoteurAdminClient;

export type MainId =
    | 'projects'
    | 'content'
    | 'schemas'
    | 'userdata'
    | 'configuration'
    | 'account'
    | 'quit';

export type Screen =
    | 'project'
    | 'pages'
    | 'navigations'
    | 'entries'
    | 'models'
    | 'templates'
    | 'structures'
    | 'blocks'
    | 'blueprints'
    | 'layouts'
    | 'media'
    | 'activity'
    | 'forms'
    | 'submissions'
    | 'webhooks'
    | 'project_settings'
    | 'api_resources'
    | 'media_settings'
    | 'ai_config'
    | 'permissions'
    | 'account_whoami'
    | 'account_logout';

export type Level = 'main' | 'content' | 'schemas' | 'userdata' | 'configuration' | 'account';

export type NavGroup = { label: string; ids: MainId[] };

export interface ListItem {
    id: string;
    label: string;
    status?: string;
    extra?: string;
}

export const SIDEBAR_WIDTH = 24;
export const LIST_LABEL_WIDTH = 36;
export const LIST_ID_WIDTH = 14;
export const LIST_PAGE_SIZE = 50;

export const MAIN_MENU: { id: MainId; label: string }[] = [
    { id: 'content', label: ' Content' },
    { id: 'schemas', label: ' Schemas' },
    { id: 'userdata', label: ' User data' },
    { id: 'configuration', label: ' Configuration' },
    { id: 'account', label: ' Account' },
    { id: 'projects', label: ' Projects' },
    { id: 'quit', label: ' Quit' }
];

export const MAIN_NAV_GROUPS: NavGroup[] = [
    { label: 'Content', ids: ['content', 'schemas'] },
    { label: 'Data', ids: ['userdata'] },
    { label: 'Settings', ids: ['configuration', 'account'] },
    { label: '', ids: ['projects'] },
    { label: '', ids: ['quit'] }
];

export const CONTENT_SUBMENU: { screen: Screen; label: string }[] = [
    { screen: 'pages', label: ' Pages' },
    { screen: 'navigations', label: ' Navigations' },
    { screen: 'entries', label: ' Entries' },
    { screen: 'layouts', label: ' Layouts' },
    { screen: 'media', label: ' Media' },
    { screen: 'activity', label: ' Activity' },
    { screen: 'project', label: ' ← Back' }
];

export const SCHEMAS_SUBMENU: { screen: Screen; label: string }[] = [
    { screen: 'templates', label: ' Templates' },
    { screen: 'models', label: ' Models' },
    { screen: 'structures', label: ' Structures' },
    { screen: 'blocks', label: ' Blocks' },
    { screen: 'blueprints', label: ' Blueprints' },
    { screen: 'forms', label: ' Forms' },
    { screen: 'project', label: ' ← Back' }
];

export const USERDATA_SUBMENU: { screen: Screen; label: string }[] = [
    { screen: 'submissions', label: ' Submissions' },
    { screen: 'project', label: ' ← Back' }
];

export const CONFIG_SUBMENU: { screen: Screen; label: string }[] = [
    { screen: 'project_settings', label: ' Project Settings' },
    { screen: 'api_resources', label: ' API Resources' },
    { screen: 'media_settings', label: ' Media Settings' },
    { screen: 'webhooks', label: ' Webhooks' },
    { screen: 'ai_config', label: ' AI' },
    { screen: 'permissions', label: ' Users & Permissions' },
    { screen: 'project', label: ' ← Back' }
];

export const ACCOUNT_SUBMENU: { screen: Screen; label: string }[] = [
    { screen: 'account_whoami', label: ' Who am I' },
    { screen: 'account_logout', label: ' Logout' },
    { screen: 'project', label: ' ← Back' }
];

export function getSubmenu(level: Level): { screen: Screen; label: string }[] {
    switch (level) {
        case 'content':
            return CONTENT_SUBMENU;
        case 'schemas':
            return SCHEMAS_SUBMENU;
        case 'userdata':
            return USERDATA_SUBMENU;
        case 'configuration':
            return CONFIG_SUBMENU;
        case 'account':
            return ACCOUNT_SUBMENU;
        default:
            return [];
    }
}
