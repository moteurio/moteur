import fs from 'fs';
import path from 'path';
import { cliRegistry } from '../registry.js';
import { getClient, getProjectId, loadConfig, saveConfig, clearConfig } from '../config.js';
import { runStudioUi } from '../ui/runUi.js';
import type { OnboardingState } from '../ui/Onboarding.js';

function loadOnboardingState(): OnboardingState | null {
    const projectDir = process.env.MOTEUR_PROJECT_DIR ?? process.cwd();
    const filePath = path.join(projectDir, '.moteur', 'onboarding.json');
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as OnboardingState;
        }
    } catch {
        // ignore
    }
    return null;
}

function saveOnboardingState(state: OnboardingState): void {
    const projectDir = process.env.MOTEUR_PROJECT_DIR ?? process.cwd();
    const dir = path.join(projectDir, '.moteur');
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'onboarding.json'), JSON.stringify(state, null, 2));
    } catch {
        // non-fatal
    }
}

export async function atelierCommand(args: Record<string, unknown>): Promise<void> {
    const config = await loadConfig();
    const loggedIn = !!(config.token || config.apiKey);
    const client = await getClient();
    const projectId = loggedIn ? ((await getProjectId(args)) ?? null) : null;
    let projectLabel = projectId ?? '';
    if (projectId) {
        try {
            const { project } = await client.projects.get(projectId);
            projectLabel = (project as { label?: string })?.label ?? projectId;
        } catch {
            // keep id as label
        }
    }
    const apiUrl = (config.apiUrl ?? 'http://localhost:3000').replace(/\/+$/, '');

    const isFirstRun = process.env.MOTEUR_FIRST_RUN === '1';
    const onboardingState = isFirstRun ? loadOnboardingState() : null;

    runStudioUi({
        getClient,
        saveConfig,
        loadConfig,
        projectId,
        projectLabel,
        apiUrl,
        loggedIn,
        token: config.token ?? null,
        onLogout: async () => {
            await clearConfig();
        },
        firstRun: isFirstRun,
        onboardingState,
        onOnboardingStateChange: saveOnboardingState
    });
}

cliRegistry.register('atelier', {
    name: '',
    description:
        'Atelier: interactive TUI to browse project, models, entries, pages, forms, assets',
    action: atelierCommand
});
