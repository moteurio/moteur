import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

export type ApiRequestType = 'studio' | 'public' | null;

export interface RequestLogEntry {
    timestamp: string;
    type: ApiRequestType;
    projectId?: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs?: number;
}

const LOG_FILE = process.env.API_REQUEST_LOG_FILE || '';
const LOG_DIR = process.env.API_REQUEST_LOG_DIR || '';

function getLogPath(): string | null {
    if (LOG_FILE && path.isAbsolute(LOG_FILE)) return LOG_FILE;
    if (LOG_DIR) return path.join(LOG_DIR, 'api-requests.log');
    return null;
}

function appendLog(entry: RequestLogEntry): void {
    const logPath = getLogPath();
    if (!logPath) return;
    const line = JSON.stringify(entry) + '\n';
    try {
        fs.appendFileSync(logPath, line, 'utf8');
    } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[API request log]', err);
        }
    }
}

/**
 * Call when response has finished. Logs the request for audit (type, projectId, path, status, duration).
 */
export function logRequest(
    req: Request,
    res: Response,
    type: ApiRequestType,
    projectId: string | undefined,
    startTime: number
): void {
    const pathName = (req.originalUrl || req.url || '').split('?')[0];
    const entry: RequestLogEntry = {
        timestamp: new Date().toISOString(),
        type,
        projectId,
        method: req.method,
        path: pathName,
        statusCode: res.statusCode,
        durationMs: Date.now() - startTime
    };
    if (type && getLogPath()) {
        appendLog(entry);
    }
}
