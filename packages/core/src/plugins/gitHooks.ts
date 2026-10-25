import type { GitCommitHook, GitCommitHookPayload } from '@moteurio/plugin-sdk';

const hooks: GitCommitHook[] = [];
const providers = new Set<string>();

export function registerGitCommitHook(hook: GitCommitHook): void {
    hooks.push(hook);
}

export function registerGitProvider(id: string): void {
    if (id) providers.add(id);
}

export function listGitProviders(): string[] {
    return [...providers];
}

export async function runGitCommitHooks(payload: GitCommitHookPayload): Promise<void> {
    for (const hook of hooks) {
        try {
            await hook(payload);
        } catch (err) {
            console.warn(
                `[git] Commit hook failed for project "${payload.projectId}":`,
                err instanceof Error ? err.message : err
            );
        }
    }
}

export function resetGitHooks(): void {
    hooks.length = 0;
    providers.clear();
}
