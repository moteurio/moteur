import type { PluginManifest } from '@moteurio/types/Plugin.js';
import type { PluginContext } from '../pluginContext.js';
import { Audit } from '@moteurio/types/Audit.js';
import { User } from '@moteurio/types/User.js';

export const manifest: PluginManifest = {
    id: 'audit',
    label: 'Audit metadata',
    description: 'Maintains created/updated audit fields on projects, models, and entries',
    source: 'builtin',
    kind: 'core'
};

function updateAudit(user: User, existingAudit: Audit = {}): Audit {
    const now = new Date().toISOString();
    const isNew = !existingAudit.revision || existingAudit.revision === 0;

    const audit: Audit = {
        createdAt: isNew ? now : existingAudit.createdAt,
        createdBy: isNew ? user.id : existingAudit.createdBy,
        updatedAt: now,
        updatedBy: user.id,
        revision: (existingAudit.revision || 0) + 1
    };

    if (existingAudit.publishedRevision != null) {
        audit.publishedRevision = existingAudit.publishedRevision;
    }
    if (existingAudit.publishedCommit != null) {
        audit.publishedCommit = existingAudit.publishedCommit;
    }
    if (existingAudit.publishedAt != null) {
        audit.publishedAt = existingAudit.publishedAt;
    }
    return audit;
}

export function init(ctx: PluginContext): void {
    ctx.onEvent('project.beforeCreate', async ({ project, user }) => {
        project.meta = project.meta || {};
        project.meta.audit = updateAudit(user, project.meta.audit);
    });

    ctx.onEvent('project.beforeUpdate', async ({ project, user }) => {
        project.meta = project.meta || {};
        project.meta.audit = updateAudit(user, project.meta.audit);
    });

    ctx.onEvent('model.beforeCreate', async ({ model, user }) => {
        model.meta = model.meta || {};
        model.meta.audit = updateAudit(user, model.meta.audit);
    });

    ctx.onEvent('model.beforeUpdate', async ({ model, user }) => {
        model.meta = model.meta || {};
        model.meta.audit = updateAudit(user, model.meta.audit);
    });

    ctx.onEvent('entry.beforeCreate', async ({ entry, user }) => {
        entry.meta = entry.meta || {};
        entry.meta.audit = updateAudit(user, entry.meta.audit);
    });

    ctx.onEvent('entry.beforeUpdate', async ({ entry, user }) => {
        entry.meta = entry.meta || {};
        entry.meta.audit = updateAudit(user, entry.meta.audit);
    });
}

export default { manifest, init };
