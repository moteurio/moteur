import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { storageConfig } from '@moteurio/core';

function assertSafeSegment(value: string, _label: string): boolean {
    if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
        return false;
    }
    return true;
}

/**
 * Local disk asset URLs — must stay in sync with LocalAdapter URL generation.
 */
export function mountStaticAssets(app: Express, basePath: string): void {
    const prefix = `${basePath}/static/assets/:projectId/:variantKey/:filename`;
    app.get(prefix, (req: Request, res: Response): void => {
        const { projectId, variantKey, filename } = req.params;
        if (
            !assertSafeSegment(projectId, 'projectId') ||
            !assertSafeSegment(variantKey, 'variantKey') ||
            !assertSafeSegment(filename, 'filename')
        ) {
            res.status(400).end();
            return;
        }

        const projectsDir = path.resolve(storageConfig.projectsDir);
        const projectRoot = path.resolve(projectsDir, projectId);
        const relProject = path.relative(projectsDir, projectRoot);
        if (relProject.startsWith('..') || path.isAbsolute(relProject)) {
            res.status(400).end();
            return;
        }

        const filePath = path.resolve(projectRoot, 'assets', variantKey, filename);
        const relFile = path.relative(projectRoot, filePath);
        if (relFile.startsWith('..') || path.isAbsolute(relFile)) {
            res.status(400).end();
            return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.status(404).end();
            return;
        }
        res.sendFile(filePath);
    });
}
