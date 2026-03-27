import { select, isCancel, cancel } from '@clack/prompts';
import { cliRegistry } from '../registry.js';
import { getClientOrThrow } from '../config.js';
import { projectSelectPrompt } from '../utils/projectSelectPrompt.js';

async function ensureProjectAndForm(
    args: Record<string, unknown>
): Promise<{ projectId: string; formId: string }> {
    const client = await getClientOrThrow();
    const projectId =
        (args.projectId as string) ??
        (args.project as string) ??
        (await projectSelectPrompt(client));
    const formId = (args.formId as string) ?? (args.form as string);
    if (!formId) {
        const { forms } = await client.forProject(projectId).forms.list();
        if (!forms?.length) throw new Error('No forms in project.');
        const form = await select({
            message: 'Form:',
            options: forms.map((f: Record<string, unknown>) => ({
                value: String(f.id),
                label: `${String(f.label ?? f.id)} (${f.id})`
            }))
        });
        if (isCancel(form)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        return { projectId, formId: form as string };
    }
    return { projectId, formId };
}

export async function listSubmissionsCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, formId } = await ensureProjectAndForm(args);
    const prj = client.forProject(projectId);
    const { submissions } = await prj.submissions.list(formId);
    if (args.json) {
        console.log(JSON.stringify(submissions ?? [], null, 2));
        return;
    }
    (submissions ?? []).forEach((s: Record<string, unknown>) => console.log(`- ${s.id}`));
}

export async function getSubmissionCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, formId } = await ensureProjectAndForm(args);
    const prj = client.forProject(projectId);
    const submissionId = args.id as string;
    if (!submissionId) {
        console.error('Use --id=<submissionId>');
        process.exit(1);
    }
    const { submission } = await prj.submissions.get(formId, submissionId);
    console.log(JSON.stringify(submission, null, 2));
}

export async function deleteSubmissionCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const { projectId, formId } = await ensureProjectAndForm(args);
    const prj = client.forProject(projectId);
    const submissionId = args.id as string;
    if (!submissionId) {
        console.error('Use --id=<submissionId>');
        process.exit(1);
    }
    await prj.submissions.delete(formId, submissionId);
    if (!args.quiet) console.log('🗑️ Deleted submission', submissionId);
}

cliRegistry.register('submissions', {
    name: '',
    description: 'List submissions',
    action: listSubmissionsCommand
});
cliRegistry.register('submissions', {
    name: 'list',
    description: 'List submissions (--project=id --formId=id)',
    action: listSubmissionsCommand
});
cliRegistry.register('submissions', {
    name: 'get',
    description: 'Get submission',
    action: getSubmissionCommand
});
cliRegistry.register('submissions', {
    name: 'delete',
    description: 'Delete submission',
    action: deleteSubmissionCommand
});
