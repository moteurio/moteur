/**
 * What host plugins may use from core: `import { getProject } from '@moteurio/core/host.js'`.
 *
 * Plugins are released from other repos, so these names are a contract: they keep their
 * signatures within a release line, and a change here is a breaking change for plugins. Every
 * other `@moteurio/core/*` path is internal and may move or change without notice. Need something
 * that isn't here? Add it here (with a test in tests/host.test.ts), don't import its file.
 */

// Projects and their content
export { getProject, getProjectById, loadProjects, updateProject } from './projects.js';
export { getModelSchema } from './models.js';
export { createEntry, getEntryForProject, updateEntry } from './entries.js';
export { default as fieldRegistry } from './registry/FieldRegistry.js';

// Forms and what visitors sent (no user checks: the plugin checks who may)
export { getFormForProject, listFormsForProject } from './forms.js';
export {
    eraseSubmission,
    getSubmissionForProject,
    listSubmissionRows,
    saveSubmissionForProject
} from './formSubmissions.js';
export type { SubmissionRow } from './utils/submissionIndex.js';

// People and sign-in
export { getUserById } from './users.js';
export { loginWithProvider, verifyJWT } from './auth.js';
export { startProviderSignIn } from './providerSignIn.js';
export { resolveOnlinePresenceMaxIdleMs, setOnlineUserIdsProvider } from './onlinePresence.js';

// A plugin's own data, stored with the project
export { getProjectJson, putProjectJson, listProjectKeys } from './utils/projectStorage.js';
export { PROJECT_KEY } from './utils/storageKeys.js';

// Media
export { getAsset, updateAsset, uploadAsset } from './assets/assetService.js';
export {
    listMediaGenerators,
    listMediaTransforms,
    listMediaVariantPresets,
    runMediaGenerator
} from './plugins/mediaPipeline.js';

// Commands, model starters, git
export { listPluginCommands } from './plugins/commandRegistry.js';
export { getModelTemplate, listModelTemplates } from './plugins/modelTemplates.js';
export { listGitProviders } from './plugins/gitHooks.js';
export { listPluginOutboundWebhookEvents } from './plugins/outboundEvents.js';

// Safety: a URL from outside must be public HTTPS before it is fetched
export { assertPublicHttpsUrl } from './webhooks/webhookService.js';

// AI: credits and the audit log the Studio reads (Setup › AI)
export { creditBalance, grantCredits, spendCredits } from './metering.js';
export { appendAiAuditEvent, type AiAuditAppendInput } from './aiAuditLogger.js';
