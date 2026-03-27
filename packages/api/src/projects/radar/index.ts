import type { Request, Response } from 'express';
import { Router } from 'express';
import type { OpenAPIV3 } from 'openapi-types';
import { optionalAuth, apiKeyAuth, requireProjectAccess } from '../../middlewares/auth.js';
import { loadRadarReport, runFullScan } from '@moteurio/core/radar/index.js';
import { sendApiError } from '../../utils/apiError.js';

const router: Router = Router({ mergeParams: true });

function requireProjectOrApiKey(req: any, res: any, next: any) {
    if (req.apiKeyAuth) return next();
    return requireProjectAccess(req, res, next);
}

/** GET /projects/:projectId/radar — list violations, optionally run full scan */
router.get(
    '/',
    optionalAuth,
    apiKeyAuth,
    requireProjectOrApiKey,
    async (req: Request, res: Response) => {
        const { projectId } = req.params;
        const scan = req.query.scan === 'true' || req.query.scan === '1';
        const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
        const model = typeof req.query.model === 'string' ? req.query.model : undefined;
        const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
        const ruleId = typeof req.query.ruleId === 'string' ? req.query.ruleId : undefined;

        try {
            let report = scan
                ? await runFullScan(projectId, { source: req.apiKeyAuth ? 'api' : 'studio' })
                : await loadRadarReport(projectId);

            if (!report) {
                report = {
                    scannedAt: new Date().toISOString(),
                    summary: { errors: 0, warnings: 0, suggestions: 0, total: 0 },
                    violations: []
                };
            }

            let violations = report.violations;
            if (severity) {
                violations = violations.filter(v => v.severity === severity);
            }
            if (model) {
                violations = violations.filter(v => v.modelSlug === model);
            }
            if (locale) {
                violations = violations.filter(v => v.locale === locale);
            }
            if (ruleId) {
                violations = violations.filter(v => v.ruleId === ruleId);
            }

            const summary = {
                errors: violations.filter(v => v.severity === 'error').length,
                warnings: violations.filter(v => v.severity === 'warning').length,
                suggestions: violations.filter(v => v.severity === 'suggestion').length,
                total: violations.length
            };

            return void res.json({
                scannedAt: report.scannedAt,
                summary,
                violations
            });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

/** GET /projects/:projectId/radar/entry/:slug — violations for one entry */
router.get(
    '/entry/:slug',
    optionalAuth,
    apiKeyAuth,
    requireProjectOrApiKey,
    async (req: Request, res: Response) => {
        const { projectId, slug } = req.params;
        try {
            const report = await loadRadarReport(projectId);
            const violations = (report?.violations ?? []).filter(v => v.entrySlug === slug);
            return void res.json({ entrySlug: slug, violations });
        } catch (err: unknown) {
            return void sendApiError(res, req, err);
        }
    }
);

export default router;
export const openapi: Record<string, OpenAPIV3.PathItemObject> = {
    '/projects/{projectId}/radar': {
        get: {
            summary: 'Get Radar violation report',
            description:
                'Returns current violations. Use ?scan=true to run a full scan first. Supports severity, model, locale, ruleId filters.',
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'scan', in: 'query', required: false, schema: { type: 'boolean' } },
                {
                    name: 'severity',
                    in: 'query',
                    required: false,
                    schema: { type: 'string', enum: ['error', 'warning', 'suggestion'] }
                },
                { name: 'model', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'locale', in: 'query', required: false, schema: { type: 'string' } },
                { name: 'ruleId', in: 'query', required: false, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Radar report',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    scannedAt: { type: 'string', format: 'date-time' },
                                    summary: {
                                        type: 'object',
                                        properties: {
                                            errors: { type: 'integer' },
                                            warnings: { type: 'integer' },
                                            suggestions: { type: 'integer' },
                                            total: { type: 'integer' }
                                        }
                                    },
                                    violations: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/RadarViolation' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/projects/{projectId}/radar/entry/{slug}': {
        get: {
            summary: 'Get Radar violations for one entry',
            parameters: [
                { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
            ],
            responses: {
                '200': {
                    description: 'Entry violations',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    entrySlug: { type: 'string' },
                                    violations: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/RadarViolation' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};
