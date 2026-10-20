/**
 * Git revision history for project schema files (models, structures, templates, forms, blocks).
 * Same shape as entry revisions; only schemas stored under the project tree are restorable.
 */
import fs from 'fs';
import type { BlockSchema } from '@moteurio/types/Block.js';
import type { FormSchema } from '@moteurio/types/Form.js';
import type { ModelSchema } from '@moteurio/types/Model.js';
import type { StructureSchema } from '@moteurio/types/Structure.js';
import type { TemplateSchema } from '@moteurio/types/Template.js';
import type { User } from '@moteurio/types/User.js';
import { parseProjectBlockIdParam, updateProjectBlock } from './blocks.js';
import { checkForm } from './forms.js';
import { getLog, show, type CommitInfo } from './git/gitService.js';
import { getModelSchema } from './models.js';
import { triggerEvent } from './utils/eventBus.js';
import { isValidId } from './utils/idUtils.js';
import { projectDir } from './utils/pathUtils.js';
import { hasProjectKey, putProjectJson } from './utils/projectStorage.js';
import { formKey, modelKey, structureKey, templateKey } from './utils/storageKeys.js';
import { validateStructure } from './validators/validateStructure.js';
import { validateModel } from './validators/validateModel.js';
import { storageConfig } from './config/storageConfig.js';
import path from 'path';

export type ProjectSchemaKind = 'model' | 'structure' | 'template' | 'form' | 'block';

export type SchemaRevision = {
    id: string;
    number: number;
    message: string;
    savedAt: string;
    savedBy?: string;
};

function revisionsFromLog(commits: CommitInfo[]): SchemaRevision[] {
    return commits.map((c, i) => ({
        id: c.hash,
        number: commits.length - i,
        message: c.message,
        savedAt: c.date,
        savedBy: c.authorName
    }));
}

function blockGitPath(projectId: string, slugParam: string): string | null {
    try {
        const slug = parseProjectBlockIdParam(projectId, slugParam);
        const filePath = path.join(storageConfig.projectsDir, projectId, 'blocks', `${slug}.json`);
        if (!fs.existsSync(filePath)) return null;
        return `blocks/${slug}.json`;
    } catch {
        return null;
    }
}

/** Project-relative git path for this schema, or null when it is not stored in the project repo. */
export async function projectSchemaGitPath(
    projectId: string,
    kind: ProjectSchemaKind,
    schemaId: string
): Promise<string | null> {
    if (!isValidId(projectId)) return null;
    switch (kind) {
        case 'model':
            return (await hasProjectKey(projectId, modelKey(schemaId))) ? modelKey(schemaId) : null;
        case 'structure':
            return (await hasProjectKey(projectId, structureKey(schemaId)))
                ? structureKey(schemaId)
                : null;
        case 'template':
            return (await hasProjectKey(projectId, templateKey(schemaId)))
                ? templateKey(schemaId)
                : null;
        case 'form':
            return (await hasProjectKey(projectId, formKey(schemaId))) ? formKey(schemaId) : null;
        case 'block':
            return blockGitPath(projectId, schemaId);
        default:
            return null;
    }
}

export function getSchemaRevisions(
    projectId: string,
    kind: ProjectSchemaKind,
    schemaId: string,
    gitPath: string,
    maxCount = 20
): SchemaRevision[] {
    const commits = getLog(projectDir(projectId), gitPath, maxCount);
    return revisionsFromLog(commits);
}

export function getSchemaAtRevision(
    projectId: string,
    gitPath: string,
    revisionId: string
): Record<string, unknown> | null {
    if (!/^[0-9a-f]{7,40}$/i.test(revisionId)) return null;
    const raw = show(projectDir(projectId), revisionId, gitPath);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function restoreSchemaAtRevision(
    user: User,
    projectId: string,
    kind: ProjectSchemaKind,
    schemaId: string,
    gitPath: string,
    revisionId: string
): Promise<Record<string, unknown>> {
    const snapshot = getSchemaAtRevision(projectId, gitPath, revisionId);
    if (!snapshot) {
        throw new Error('Revision not found');
    }

    switch (kind) {
        case 'model': {
            await getModelSchema(user, projectId, schemaId);
            const schema = { ...snapshot, id: schemaId } as ModelSchema;
            const validation = validateModel(schema);
            if (!validation.valid) {
                throw new Error(
                    `Validation failed: ${validation.issues.map(i => i.message).join(', ')}`
                );
            }
            await putProjectJson(projectId, modelKey(schemaId), schema);
            triggerEvent('content.saved', {
                projectId,
                paths: [modelKey(schemaId)],
                message: `Restore model ${schemaId} from ${revisionId.slice(0, 7)} — ${user.name ?? user.id}`,
                user
            });
            triggerEvent('model.afterUpdate', { model: schema, user, projectId });
            return schema as unknown as Record<string, unknown>;
        }
        case 'structure': {
            const schema = { ...snapshot, type: schemaId } as StructureSchema;
            const validationResult = validateStructure(schema);
            if (validationResult.issues.length > 0) {
                throw new Error(
                    `Structure validation failed: ${validationResult.issues.map(i => i.message).join(', ')}`
                );
            }
            await putProjectJson(projectId, structureKey(schemaId), schema);
            triggerEvent('content.saved', {
                projectId,
                paths: [structureKey(schemaId)],
                message: `Restore structure ${schemaId} from ${revisionId.slice(0, 7)} — ${user.name ?? user.id}`,
                user
            });
            triggerEvent('structure.afterUpdate', { structure: schema, user, projectId });
            return schema as unknown as Record<string, unknown>;
        }
        case 'template': {
            const schema = { ...snapshot, id: schemaId, projectId } as TemplateSchema;
            await putProjectJson(projectId, templateKey(schemaId), schema);
            triggerEvent('content.saved', {
                projectId,
                paths: [templateKey(schemaId)],
                message: `Restore template ${schemaId} from ${revisionId.slice(0, 7)} — ${user.name ?? user.id}`,
                user
            });
            triggerEvent('template.afterUpdate', { template: schema, user, projectId });
            return schema as unknown as Record<string, unknown>;
        }
        case 'form': {
            const schema = {
                ...snapshot,
                id: schemaId,
                updatedAt: new Date().toISOString()
            } as FormSchema;
            checkForm(schema);
            await putProjectJson(projectId, formKey(schemaId), schema);
            triggerEvent('content.saved', {
                projectId,
                paths: [formKey(schemaId)],
                message: `Restore form ${schemaId} from ${revisionId.slice(0, 7)} — ${user.name ?? user.id}`,
                user
            });
            triggerEvent('form.afterUpdate', { form: schema, user, projectId });
            return schema as unknown as Record<string, unknown>;
        }
        case 'block': {
            const slug = parseProjectBlockIdParam(projectId, schemaId);
            const body = { ...snapshot } as unknown as BlockSchema;
            const updated = updateProjectBlock(projectId, slug, body, 'replace');
            return updated as unknown as Record<string, unknown>;
        }
        default:
            throw new Error('Unknown schema kind');
    }
}
