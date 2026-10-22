/** Getting content out: reviews, schedules, notes, notifications, and what happened. */
import { group, id, project, type ArgSpec } from '../spec.js';
import { localized } from '../format.js';

const P = '/projects/{project}';

export const reviews = group('reviews', [
    {
        name: 'list',
        summary: 'Reviews: waiting, approved, sent back',
        args: [
            project,
            {
                name: 'status',
                description: 'Only these',
                choices: ['pending', 'approved', 'rejected'],
                in: 'query'
            },
            {
                name: 'model',
                description: 'Only this model’s entries',
                in: 'query',
                key: 'modelId'
            },
            { name: 'entry', description: 'Only this entry', in: 'query', key: 'entryId' }
        ],
        http: `GET ${P}/reviews`,
        pick: 'reviews',
        table: [
            { key: 'id', header: 'id' },
            { key: 'status', header: 'status' },
            {
                key: 'modelId',
                header: 'model',
                format: (v, r) => String(v ?? (r.pageId ? 'page' : ''))
            },
            { key: 'entryId', header: 'entry', format: (v, r) => String(v ?? r.pageId ?? '') },
            { key: 'requestedByName', header: 'asked by' },
            { key: 'createdAt', header: 'asked' }
        ],
        readOnly: true,
        examples: ['moteur reviews list --status pending']
    },
    {
        name: 'get',
        summary: 'Show one review',
        args: [project, id('Review')],
        http: `GET ${P}/reviews/{id}`,
        readOnly: true
    },
    {
        name: 'approve',
        summary: 'Approve a review: the entry is published',
        args: [project, id('Review')],
        http: `POST ${P}/reviews/{id}/approve`,
        done: (_r, a) => `Approved ${a.id}.`
    },
    {
        name: 'reject',
        summary: 'Send it back with a note for the asker',
        args: [
            project,
            id('Review'),
            {
                name: 'reason',
                description: 'What should change (becomes a note on the entry)',
                in: 'body'
            }
        ],
        http: `POST ${P}/reviews/{id}/reject`,
        done: (_r, a) => `Sent back ${a.id}.`
    }
]);

const scheduleWhen: ArgSpec = {
    name: 'at',
    description: 'When: an ISO date and time (2026-11-13T09:00:00-05:00)',
    required: true,
    in: 'body',
    key: 'scheduledAt'
};

export const schedules = group('schedules', [
    {
        name: 'list',
        summary: 'Publishing and unpublishing to come (and past)',
        args: [
            project,
            {
                name: 'status',
                description: 'pending, processing, done, failed or cancelled (comma for several)',
                in: 'query'
            },
            {
                name: 'action',
                description: 'Only publish or unpublish',
                choices: ['publish', 'unpublish'],
                in: 'query'
            },
            {
                name: 'kind',
                description: 'Only entries or pages',
                choices: ['entry', 'page'],
                in: 'query',
                key: 'resourceType'
            },
            {
                name: 'resource',
                description: 'Only this entry or page id',
                in: 'query',
                key: 'resourceId'
            }
        ],
        http: `GET ${P}/schedules`,
        pick: 'schedules',
        table: [
            { key: 'id', header: 'id' },
            { key: 'action', header: 'action' },
            { key: 'resourceType', header: 'kind' },
            {
                key: 'resourceId',
                header: 'what',
                format: (v, r) => (r.modelId ? `${r.modelId}/${v}` : String(v))
            },
            { key: 'scheduledAt', header: 'when' },
            { key: 'status', header: 'status' }
        ],
        readOnly: true
    },
    {
        name: 'get',
        summary: 'Show one schedule',
        args: [project, id('Schedule')],
        http: `GET ${P}/schedules/{id}`,
        readOnly: true
    },
    {
        name: 'create',
        summary: 'Publish or unpublish an entry or a page at a given time',
        args: [
            project,
            {
                name: 'action',
                description: 'publish or unpublish',
                required: true,
                choices: ['publish', 'unpublish'],
                in: 'body',
                positional: 0
            },
            {
                name: 'kind',
                description: 'entry or page',
                choices: ['entry', 'page'],
                default: 'entry',
                in: 'body',
                key: 'resourceType'
            },
            {
                name: 'model',
                description: 'The entry’s model (for entries)',
                in: 'body',
                key: 'modelId',
                aliases: ['modelId']
            },
            {
                name: 'id',
                description: 'Entry or page id',
                required: true,
                in: 'body',
                key: 'resourceId',
                positional: 1
            },
            scheduleWhen
        ],
        http: `POST ${P}/schedules`,
        done: (_r, a) => `${a.action === 'publish' ? 'Goes live' : 'Goes offline'} ${a.at}.`,
        examples: [
            'moteur schedules create publish glace --model article --at 2026-11-13T09:00:00-05:00'
        ]
    },
    {
        name: 'cancel',
        summary: 'Cancel a schedule that hasn’t run',
        args: [project, id('Schedule')],
        http: `POST ${P}/schedules/{id}/cancel`,
        done: (_r, a) => `Cancelled ${a.id}.`
    },
    {
        name: 'delete',
        summary: 'Delete a schedule from the list',
        args: [project, id('Schedule')],
        http: `DELETE ${P}/schedules/{id}`,
        destructive: true,
        done: (_r, a) => `Deleted ${a.id}.`
    }
]);

/** What a note is about: `article/glace` (an entry), `page/home`, or another kind with --kind. */
const about: ArgSpec[] = [
    {
        name: 'on',
        description: 'What it’s about: model/entry (article/glace), or a page id with --kind page',
        required: true,
        positional: 0,
        in: 'none'
    },
    {
        name: 'kind',
        description: 'entry (default) or page',
        choices: ['entry', 'page'],
        default: 'entry',
        in: 'none'
    },
    { name: 'field', description: 'A field of it (title, body.0)', in: 'none' }
];

function resource(args: Record<string, unknown>): { resourceType: string; resourceId: string } {
    const on = String(args.on);
    return args.kind === 'page'
        ? { resourceType: 'page', resourceId: on }
        : { resourceType: 'entry', resourceId: on.replace('/', '__') };
}

export const comments = group('comments', [
    {
        name: 'list',
        summary: 'Notes on an entry or a page',
        args: [
            ...about,
            project,
            {
                name: 'resolved',
                type: 'boolean',
                description: 'Include the ones marked done',
                in: 'none'
            }
        ],
        run: async ctx => {
            const client = await ctx.client();
            const query: Record<string, string> = { ...resource(ctx.args) };
            if (ctx.args.field) query.fieldPath = String(ctx.args.field);
            if (ctx.args.resolved) query.includeResolved = 'true';
            return client.get(
                `/projects/${encodeURIComponent(await ctx.project())}/comments`,
                query
            );
        },
        covers: [`GET ${P}/comments`],
        pick: 'comments',
        table: [
            { key: 'id', header: 'id' },
            { key: 'fieldPath', header: 'field' },
            { key: 'authorName', header: 'by' },
            { key: 'createdAt', header: 'when' },
            { key: 'body', header: 'note' }
        ],
        readOnly: true,
        examples: ['moteur comments list article/glace']
    },
    {
        name: 'add',
        summary: 'Leave a note on an entry, a page, or one of their fields',
        args: [
            ...about,
            project,
            { name: 'text', description: 'The note', required: true, positional: 1, in: 'none' },
            { name: 'reply-to', description: 'Answer this note (id)', in: 'none' }
        ],
        run: async ctx => {
            const client = await ctx.client();
            return client.post(`/projects/${encodeURIComponent(await ctx.project())}/comments`, {
                ...resource(ctx.args),
                body: ctx.args.text,
                ...(ctx.args.field ? { fieldPath: ctx.args.field } : {}),
                ...(ctx.args['reply-to'] ? { parentId: ctx.args['reply-to'] } : {})
            });
        },
        covers: [`POST ${P}/comments`],
        done: () => 'Note left.',
        examples: ['moteur comments add article/glace "Check the date" --field title']
    },
    {
        name: 'edit',
        summary: 'Change a note’s text',
        args: [
            project,
            id('Note'),
            {
                name: 'text',
                description: 'The new text',
                required: true,
                positional: 1,
                in: 'body',
                key: 'body'
            }
        ],
        http: `PATCH ${P}/comments/{id}`,
        done: () => 'Note changed.'
    },
    {
        name: 'resolve',
        summary: 'Mark a note done',
        args: [project, id('Note')],
        http: `POST ${P}/comments/{id}/resolve`,
        done: () => 'Marked done.'
    },
    {
        name: 'delete',
        summary: 'Delete a note',
        args: [project, id('Note')],
        http: `DELETE ${P}/comments/{id}`,
        destructive: true,
        done: () => 'Deleted.'
    }
]);

export const notifications = group('notifications', [
    {
        name: 'list',
        summary: 'Your notifications (unread first)',
        args: [project, { name: 'all', type: 'boolean', description: 'Read ones too', in: 'none' }],
        run: async ctx => {
            const client = await ctx.client();
            return client.get(
                `/projects/${encodeURIComponent(await ctx.project())}/notifications`,
                ctx.args.all ? { unreadOnly: 'false' } : {}
            );
        },
        covers: [`GET ${P}/notifications`],
        pick: 'notifications',
        table: [
            { key: 'id', header: 'id' },
            { key: 'type', header: 'what' },
            { key: 'message', header: 'message', format: localized },
            { key: 'createdAt', header: 'when' },
            { key: 'read', header: 'read' }
        ],
        readOnly: true
    },
    {
        name: 'read',
        summary: 'Mark one read',
        args: [project, id('Notification')],
        http: `POST ${P}/notifications/{id}/read`,
        done: () => 'Marked read.'
    },
    {
        name: 'read-all',
        summary: 'Mark them all read',
        args: [project],
        http: `POST ${P}/notifications/read-all`,
        done: () => 'All read.'
    }
]);

const ACTIVITY_TABLE = [
    { key: 'timestamp', header: 'when' },
    { key: 'userName', header: 'who' },
    { key: 'action', header: 'did' },
    { key: 'resourceType', header: 'kind' },
    { key: 'resourceId', header: 'what' }
];
const activityPaging: ArgSpec[] = [
    { name: 'limit', type: 'number', description: 'How many (max 200)', in: 'query' },
    { name: 'before', description: 'Older than this time (ISO), for the next page', in: 'query' }
];

export const activity = group('activity', [
    {
        name: 'list',
        summary: 'What happened in a project, newest first',
        args: [project, ...activityPaging],
        http: `GET ${P}/activity`,
        pick: 'events',
        table: ACTIVITY_TABLE,
        readOnly: true
    },
    {
        name: 'of',
        summary: 'What happened to one thing: an entry (entry article__glace), a page, a model…',
        args: [
            project,
            {
                name: 'kind',
                description: 'entry, page, model, asset…',
                required: true,
                positional: 0
            },
            {
                name: 'what',
                description: 'Its id (entries: model__entry)',
                required: true,
                positional: 1
            }
        ],
        http: `GET ${P}/activity/{kind}/{what}`,
        pick: 'events',
        table: ACTIVITY_TABLE,
        readOnly: true
    },
    {
        name: 'server',
        summary: 'What happened across the server (operators)',
        args: activityPaging,
        http: 'GET /activity',
        pick: 'events',
        table: ACTIVITY_TABLE,
        readOnly: true
    }
]);
