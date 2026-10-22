import { loadConfig, getClient, getProjectId } from '@moteurio/commands';

/* global AbortController, fetch, setTimeout, clearTimeout */

interface CheckResult {
    name: string;
    ok: boolean;
    hint?: string;
}

export async function doctorChecks(args: Record<string, unknown>): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const config = await loadConfig();
    const projectId = await getProjectId(args);
    const baseURL = (config.apiUrl ?? 'http://localhost:3000').replace(/\/+$/, '');

    // 1. Config has a host
    if (!config.apiUrl && !config.token && !config.apiKey) {
        results.push({
            name: 'Config',
            ok: false,
            hint: 'Run: moteur auth login'
        });
    } else {
        results.push({ name: 'Config', ok: true });
    }

    // 2. Host reachable
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        await fetch(baseURL + '/openapi.json', { signal: ctrl.signal });
        clearTimeout(t);
        results.push({ name: 'Host reachable', ok: true });
    } catch (_e) {
        results.push({
            name: 'Host reachable',
            ok: false,
            hint: `Cannot reach ${baseURL}. Check URL and network.`
        });
    }

    // 3. Auth valid
    if (!config.token && !config.apiKey) {
        results.push({
            name: 'Auth',
            ok: false,
            hint: 'Run: moteur auth login'
        });
    } else {
        try {
            const client = await getClient();
            await client.auth.me();
            results.push({ name: 'Auth', ok: true });
        } catch (_e) {
            results.push({
                name: 'Auth',
                ok: false,
                hint: 'Token invalid or expired. Run: moteur auth login'
            });
        }
    }

    // 4. Default project exists (if set)
    if (!projectId) {
        results.push({
            name: 'Default project',
            ok: false,
            hint: 'No default project. Run: moteur projects list and set default from menu'
        });
    } else if (!config.token && !config.apiKey) {
        results.push({
            name: 'Default project',
            ok: false,
            hint: 'Log in first, then set default project'
        });
    } else {
        try {
            const client = await getClient();
            await client.projects.get(projectId);
            results.push({ name: 'Default project', ok: true });
        } catch (_e) {
            results.push({
                name: 'Default project',
                ok: false,
                hint: `Project "${projectId}" not found. Run: moteur projects list`
            });
        }
    }

    return results;
}
