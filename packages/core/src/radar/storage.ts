import type { RadarViolation, RadarReport } from '@moteurio/types/Radar.js';
import { getProjectJson, putProjectJson } from '../utils/projectStorage.js';
import { RADAR_KEY } from '../utils/storageKeys.js';

export async function loadRadarReport(projectId: string): Promise<RadarReport | null> {
    const report = await getProjectJson<RadarReport>(projectId, RADAR_KEY);
    return report ?? null;
}

export async function saveRadarReport(projectId: string, report: RadarReport): Promise<void> {
    await putProjectJson(projectId, RADAR_KEY, report);
}

export function computeSummary(violations: RadarViolation[]): RadarReport['summary'] {
    let errors = 0;
    let warnings = 0;
    let suggestions = 0;
    for (const v of violations) {
        if (v.severity === 'error') errors++;
        else if (v.severity === 'warning') warnings++;
        else suggestions++;
    }
    return {
        errors,
        warnings,
        suggestions,
        total: violations.length
    };
}
