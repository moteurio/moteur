import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { hasRole } from '@moteurio/types';
import {
    creditBalance,
    currentPeriod,
    getMeteringStore,
    imageTraffic,
    periodBounds,
    recentPeriods,
    submissionCount
} from '@moteurio/core/metering.js';
import { listInvites } from '@moteurio/core/invites.js';
import {
    COUNT_KINDS,
    getCountLimits,
    getImageTrafficQuota,
    getPeopleLimit,
    getRequestQuota,
    getStorageLimit,
    getSubmissionQuota,
    type CountKind
} from '@moteurio/core/planLimits.js';
import { projectCounts } from '@moteurio/core/projectCounts.js';
import { storageUsed } from '@moteurio/core/assets/assetService.js';
import { getProjectUsers } from '@moteurio/core/users.js';
import { requireProjectAccess } from '../middlewares/auth.js';
import { sendApiError } from '../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

const HISTORY_MONTHS = 6;

/** This month's requests, image traffic, AI credits, seats and storage for a project, with the months before. */
export async function projectUsage(projectId: string) {
    const store = getMeteringStore();
    const period = currentPeriod();
    const balance = creditBalance(projectId, period);
    const byReason: Record<string, number> = {};
    for (const e of store.creditEntries(projectId, period)) {
        if (e.type !== 'spend') continue;
        const key = e.reason ?? 'other';
        byReason[key] = (byReason[key] ?? 0) + e.amount;
    }
    const used = await projectCounts(projectId);
    const max = getCountLimits(projectId);
    const counts = Object.fromEntries(
        COUNT_KINDS.map(k => [k, { used: used[k], max: max[k] }])
    ) as Record<CountKind, { used: number; max: number | null }>;
    return {
        period,
        ...periodBounds(period),
        requests: {
            public: store.requestTotals(period).projects[projectId]?.publicRequests ?? 0,
            max: getRequestQuota(projectId)
        },
        images: {
            ...imageTraffic(projectId, period),
            max: getImageTrafficQuota(projectId)
        },
        submissions: {
            received: submissionCount(projectId, period),
            max: getSubmissionQuota(projectId)
        },
        storage: {
            used: await storageUsed(projectId),
            max: getStorageLimit(projectId)
        },
        people: {
            members: getProjectUsers(projectId).length,
            invited: listInvites(projectId).length,
            max: getPeopleLimit(projectId)
        },
        counts,
        credits: {
            allowance: balance.allowance,
            granted: balance.granted,
            used: balance.used,
            remaining: balance.remaining,
            unlimited: balance.allowance === null,
            byReason
        },
        history: recentPeriods(HISTORY_MONTHS, period).map(p => ({
            period: p,
            publicRequests: store.requestTotals(p).projects[projectId]?.publicRequests ?? 0,
            imageBytes: store.imageTraffic(p, projectId).bytes,
            creditsUsed: store.creditTotals(projectId, p).used
        }))
    };
}

router.get('/:projectId/usage', requireProjectAccess, async (req: Request, res: Response) => {
    if (!hasRole(req.user, 'admin') && !hasRole(req.user, 'billing')) {
        return void res
            .status(403)
            .json({ error: 'Admin or Billing role required in this project' });
    }
    try {
        return void res.json({
            usage: await projectUsage((req.params as Record<string, string>).projectId)
        });
    } catch (err) {
        return void sendApiError(res, req, err);
    }
});

/** What the project's plan allows; any member may read it (the Studio hides what can't be used). */
router.get('/:projectId/limits', requireProjectAccess, (req: Request, res: Response) => {
    const { projectId } = req.params as Record<string, string>;
    return void res.json({
        limits: {
            people: getPeopleLimit(projectId),
            storage: getStorageLimit(projectId),
            requests: getRequestQuota(projectId),
            imageTraffic: getImageTrafficQuota(projectId),
            submissions: getSubmissionQuota(projectId),
            ...getCountLimits(projectId)
        }
    });
});

export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/limits': {
        get: {
            summary: "What a project's plan allows",
            description:
                'Each limit is a number, or null for no limit: `people`, `storage` (bytes), `requests` (public, a month), `imageTraffic` (bytes of images and files sent, a month), `submissions` (form submissions, a month), and how many `channels`, `models`, `entries`, `forms`, `structures`, `blocks`, `templates` and `pages` it may have. Any member.',
            tags: ['Usage'],
            security: [{ bearerAuth: [] }],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: '`{ limits }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    limits: { $ref: '#/components/schemas/ProjectLimits' }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/usage': {
        get: {
            summary: "A project's usage this month",
            description: `Public API requests, image traffic and AI credits for this calendar month (UTC), what the credits went on (\`byReason\`), and the last ${HISTORY_MONTHS} months. \`allowance\` and \`remaining\` are null when credits are unlimited. Admin or Billing role in the project.`,
            tags: ['Usage'],
            security: [{ bearerAuth: [] }],
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: '`{ usage }`',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: { usage: { $ref: '#/components/schemas/ProjectUsage' } }
                            }
                        }
                    }
                },
                '403': { description: 'Neither Admin nor Billing in this project' }
            }
        }
    }
};

export const schemas: OpenAPIV3.ComponentsObject['schemas'] = {
    ProjectLimits: {
        type: 'object',
        description: "What the project's plan allows. Null: no limit.",
        required: [
            'people',
            'storage',
            'requests',
            'imageTraffic',
            'submissions',
            'channels',
            'models',
            'entries',
            'forms',
            'structures',
            'blocks',
            'templates',
            'pages'
        ],
        properties: {
            people: { type: 'integer', nullable: true },
            storage: { type: 'integer', nullable: true, description: 'Bytes of files' },
            requests: {
                type: 'integer',
                nullable: true,
                description: 'Public API requests a month'
            },
            imageTraffic: {
                type: 'integer',
                nullable: true,
                description: 'Bytes of images and files sent a month'
            },
            submissions: {
                type: 'integer',
                nullable: true,
                description: 'Form submissions a month'
            },
            channels: { type: 'integer', nullable: true },
            models: { type: 'integer', nullable: true },
            entries: { type: 'integer', nullable: true },
            forms: { type: 'integer', nullable: true },
            structures: { type: 'integer', nullable: true },
            blocks: { type: 'integer', nullable: true },
            templates: { type: 'integer', nullable: true },
            pages: { type: 'integer', nullable: true }
        }
    },
    ProjectUsage: {
        type: 'object',
        required: [
            'period',
            'start',
            'end',
            'requests',
            'images',
            'submissions',
            'people',
            'storage',
            'counts',
            'credits',
            'history'
        ],
        properties: {
            period: { type: 'string', description: '`YYYY-MM` (UTC)' },
            start: { type: 'string', format: 'date-time' },
            end: { type: 'string', format: 'date-time' },
            requests: {
                type: 'object',
                properties: {
                    public: { type: 'integer' },
                    max: {
                        type: 'integer',
                        nullable: true,
                        description: 'Monthly quota of public requests. Null: no limit'
                    }
                }
            },
            images: {
                type: 'object',
                description:
                    'Images and files sent to sites and browsers this month (originals and sizes); a browser or CDN asking again for one it has (304) is not counted.',
                properties: {
                    requests: { type: 'integer' },
                    bytes: { type: 'integer' },
                    max: {
                        type: 'integer',
                        nullable: true,
                        description: 'Monthly quota of bytes. Null: no limit'
                    }
                }
            },
            submissions: {
                type: 'object',
                description: 'Form submissions received this month (honeypot catches left out).',
                properties: {
                    received: { type: 'integer' },
                    max: { type: 'integer', nullable: true, description: 'Null: no limit' }
                }
            },
            storage: {
                type: 'object',
                description: 'Bytes of files, as uploaded (image copies not counted).',
                properties: {
                    used: { type: 'integer' },
                    max: { type: 'integer', nullable: true, description: 'Null: no limit' }
                }
            },
            people: {
                type: 'object',
                description: 'Seats: members and pending invites both count against `max`.',
                properties: {
                    members: { type: 'integer' },
                    invited: { type: 'integer' },
                    max: { type: 'integer', nullable: true, description: 'Null: no limit' }
                }
            },
            counts: {
                type: 'object',
                description:
                    'How many channels, models, entries (every status), forms, structures and blocks (the project’s own), templates and pages (folders included) the project has, against its plan.',
                additionalProperties: {
                    type: 'object',
                    properties: {
                        used: { type: 'integer' },
                        max: { type: 'integer', nullable: true, description: 'Null: no limit' }
                    }
                }
            },
            credits: {
                type: 'object',
                properties: {
                    allowance: { type: 'integer', nullable: true },
                    granted: { type: 'integer' },
                    used: { type: 'integer' },
                    remaining: { type: 'integer', nullable: true },
                    unlimited: { type: 'boolean' },
                    byReason: { type: 'object', additionalProperties: { type: 'integer' } }
                }
            },
            history: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        period: { type: 'string' },
                        publicRequests: { type: 'integer' },
                        imageBytes: { type: 'integer' },
                        creditsUsed: { type: 'integer' }
                    }
                }
            }
        }
    }
};

export default router;
