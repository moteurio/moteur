import type { RadarGraph, RadarViolation } from '@moteurio/types/Radar.js';

export interface RadarRuleContext {
    entry: {
        slug: string;
        modelId: string;
        data: Record<string, unknown>;
        status?: string;
        meta?: { audit?: { updatedAt?: string } };
    };
    model: {
        id: string;
        fields: Record<string, { type?: string; options?: Record<string, unknown> }>;
    };
    graph: RadarGraph;
    locales: string[];
}

export type RuleEvaluator = (ctx: RadarRuleContext) => RadarViolation[];
