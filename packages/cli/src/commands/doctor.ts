import { cliRegistry } from '../registry.js';
import { loadConfig, getClient, getProjectId } from '../config.js';
import chalk from 'chalk';

interface CheckResult {
    name: string;
    ok: boolean;
    hint?: string;
}

async function runChecks(args: Record<string, unknown>): Promise<CheckResult[]> {
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
    } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
            results.push({
                name: 'Default project',
                ok: false,
                hint: `Project "${projectId}" not found. Run: moteur projects list`
            });
        }
    }

    return results;
}

export async function doctorCommand(args: Record<string, unknown>): Promise<void> {
    const results = await runChecks(args);

    if (args.json) {
        console.log(JSON.stringify({ checks: results, ok: results.every(r => r.ok) }, null, 2));
        process.exit(results.every(r => r.ok) ? 0 : 1);
        return;
    }

    if (!args.quiet) {
        console.log('\n  Moteur doctor\n');
        for (const r of results) {
            const sym = r.ok ? chalk.green('✓') : chalk.red('✗');
            const line = `  ${sym} ${r.name}`;
            console.log(r.ok ? chalk.green(line) : chalk.red(line));
            if (!r.ok && r.hint) console.log(chalk.gray('    → ' + r.hint));
        }
        console.log('');
    }

    process.exit(results.every(r => r.ok) ? 0 : 1);
}

cliRegistry.register('doctor', {
    name: '',
    description:
        'Check CLI setup: config, host reachable, auth, default project (not the same as radar)',
    action: doctorCommand
});
