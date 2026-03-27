import { randomUUID } from 'node:crypto';
import {
    text,
    password as passwordPrompt,
    select,
    confirm,
    isCancel,
    cancel
} from '@clack/prompts';
import { config as loadDotenv } from 'dotenv';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { OPERATOR_ROLE_SLUG } from '@moteurio/types';
import { cliRegistry } from '../registry.js';
import {
    getClientOrThrow,
    loadConfig,
    saveConfig,
    clearConfig,
    isWebSessionMode
} from '../config.js';

/** Extract a user-visible message from a login/API error (never empty). */
function formatLoginError(err: unknown): string {
    const e = err as Error & { status?: number; response?: { data?: unknown } };
    const msg = e?.message?.trim();
    const status = e?.status;
    const data = e?.response?.data as { error?: string; message?: string } | undefined;
    const bodyMsg = (data?.error ?? data?.message)?.trim();
    if (bodyMsg) return bodyMsg;
    if (msg) return msg;
    if (status === 401) return 'Invalid email or password.';
    if (status === 403) return 'Access denied.';
    if (status) return `Server returned HTTP ${status}.`;
    return 'Invalid credentials or server unreachable.';
}

export async function loginCommand(args: Record<string, unknown>): Promise<void> {
    if (await isWebSessionMode()) {
        console.error('This command is not available in web session mode.');
        process.exit(1);
    }
    const config = await loadConfig();
    const defaultUrl = config.apiUrl ?? 'http://localhost:3000';
    let apiUrl = args.apiUrl as string | undefined;
    if (!apiUrl) {
        const v = await text({
            message: 'API URL (host):',
            initialValue: defaultUrl
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        apiUrl = v?.trim() || defaultUrl;
    }
    let username = args.username as string | undefined;
    if (!username) {
        const v = await text({ message: 'Email:' });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        username = v;
    }
    let password = args.password as string | undefined;
    if (!password) {
        const v = await passwordPrompt({ message: 'Password:' });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        password = v;
    }

    const baseURL = apiUrl.replace(/\/+$/, '');
    const { createMoteurAdminClient } = await import('@moteurio/client');
    const loginClient = createMoteurAdminClient({ baseURL });
    const fromMenu = args.fromMenu === true;
    try {
        const result = await loginClient.auth.login(username, password);
        await saveConfig({
            apiUrl: baseURL,
            token: result.token,
            projectId: config.projectId
        });
        console.log('✅ Login successful! Config saved to ~/.moteur/config.json');
    } catch (err) {
        const message = formatLoginError(err);
        console.error('❌ Login failed:', message);
        if (fromMenu) {
            const tryAgain = await select({
                message: 'What do you want to do?',
                options: [
                    { value: true, label: 'Try again' },
                    { value: false, label: 'Back to main menu' }
                ]
            });
            if (isCancel(tryAgain)) return;
            if (tryAgain === true) return loginCommand({ ...args, fromMenu: true });
            return;
        }
        process.exit(1);
    }
}

export async function logoutCommand(): Promise<void> {
    if (await isWebSessionMode()) {
        console.error('This command is not available in web session mode.');
        process.exit(1);
    }
    await clearConfig();
    console.log('✅ Logout successful! Config cleared.');
}

export async function whoamiCommand(): Promise<void> {
    const client = await getClientOrThrow();
    try {
        const { user } = await client.auth.me();
        console.log('Current user:', JSON.stringify(user, null, 2));
    } catch (err) {
        console.error('❌', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

const MIN_PASSWORD_LEN = 8;

function isValidEmail(s: string): boolean {
    const t = s.trim();
    return t.length > 0 && t.includes('@') && !t.includes(' ');
}

async function assignUserToProject(userId: string, projectId: string): Promise<void> {
    const { getProjectJson, putProjectJson } =
        await import('@moteurio/core/utils/projectStorage.js');
    const { PROJECT_KEY } = await import('@moteurio/core/utils/storageKeys.js');
    const { addProjectToUser } = await import('@moteurio/core/users.js');
    const { isExistingProjectId } = await import('@moteurio/core/utils/fileUtils.js');

    if (!isExistingProjectId(projectId)) {
        throw new Error(
            `Project "${projectId}" not found (check cwd, DATA_ROOT, or PROJECTS_DIR).`
        );
    }
    const project = await getProjectJson<ProjectSchema>(projectId, PROJECT_KEY);
    if (!project?.id) {
        throw new Error(`Project "${projectId}" has no project.json`);
    }
    const prev = project.users ?? [];
    if (prev.includes(userId)) return;
    await putProjectJson(projectId, PROJECT_KEY, { ...project, users: [...prev, userId] });
    addProjectToUser(userId, projectId);
}

/**
 * Create a user in local users.json (same storage as the API). Does not call the HTTP API.
 * Run from the repo/data root or set DATA_ROOT / AUTH_USERS_FILE so paths match the server.
 */
export async function createUserCommand(args: Record<string, unknown>): Promise<void> {
    if (await isWebSessionMode()) {
        console.error('This command is not available in web session mode.');
        process.exit(1);
    }
    loadDotenv();

    let email = (args.email as string | undefined)?.trim();
    let password = args.password as string | undefined;
    let name = (args.name as string | undefined)?.trim();
    const projectIdArg = (args.project as string | undefined)?.trim();

    if (!email && process.stdout.isTTY) {
        const v = await text({ message: 'Email:' });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        email = (v as string)?.trim();
    }
    if (!email || !isValidEmail(email)) {
        console.error('Valid email is required (use --email= or run interactively).');
        process.exit(1);
    }

    if (!password && process.stdout.isTTY) {
        const v = await passwordPrompt({
            message: `Password (min ${MIN_PASSWORD_LEN} chars):`,
            validate: (value: string | undefined) =>
                value && value.length >= MIN_PASSWORD_LEN
                    ? undefined
                    : `At least ${MIN_PASSWORD_LEN} characters`
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        password = v as string;
        const again = await passwordPrompt({ message: 'Confirm password:' });
        if (isCancel(again)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        if (again !== password) {
            console.error('Passwords do not match.');
            process.exit(1);
        }
    }
    if (!password || password.length < MIN_PASSWORD_LEN) {
        console.error(
            `Password must be at least ${MIN_PASSWORD_LEN} characters (use --password= in CI only).`
        );
        process.exit(1);
    }

    if (name === undefined && process.stdout.isTTY) {
        const v = await text({ message: 'Name (optional):' });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        name = (v as string)?.trim() || undefined;
    }

    let grantOperator =
        args.operator === true ||
        args.admin === true ||
        (args.operator as string) === 'true' ||
        (args.admin as string) === 'true';
    if (
        !grantOperator &&
        process.stdout.isTTY &&
        args.operator === undefined &&
        args.admin === undefined
    ) {
        const v = await confirm({
            message: `Grant platform operator role (${OPERATOR_ROLE_SLUG})?`,
            initialValue: false
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        grantOperator = v === true;
    }

    let projectId = projectIdArg;
    if (!projectId && process.stdout.isTTY) {
        const v = await text({
            message: 'Add to project ID (optional; access via project.json users list):',
            placeholder: 'e.g. demo'
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        projectId = (v as string)?.trim() || undefined;
    }

    const { createUser } = await import('@moteurio/core/users.js');
    const { hashPassword } = await import('@moteurio/core/auth.js');
    const { storageConfig } = await import('@moteurio/core/config/storageConfig.js');

    const passwordHash = await hashPassword(password);
    const user = {
        id: randomUUID(),
        email,
        name,
        passwordHash,
        roles: grantOperator ? [OPERATOR_ROLE_SLUG] : [],
        projects: [] as string[],
        isActive: true
    };

    try {
        createUser(user);
        if (projectId) await assignUserToProject(user.id, projectId);
    } catch (err) {
        console.error('❌', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }

    if (args.json) {
        const { passwordHash: _, ...safe } = user;
        console.log(JSON.stringify(safe, null, 2));
        return;
    }
    console.log('✅ User created:', user.email, `(${user.id})`);
    console.log('   Users file:', storageConfig.usersFile);
    if (projectId) console.log('   Added to project:', projectId);
}

/**
 * Reset password in local users.json (same storage as the API). No HTTP login required.
 */
export async function resetPasswordCommand(args: Record<string, unknown>): Promise<void> {
    if (await isWebSessionMode()) {
        console.error('This command is not available in web session mode.');
        process.exit(1);
    }
    loadDotenv();

    let target = (
        (args.user as string | undefined) ??
        (args.email as string | undefined) ??
        (args.id as string | undefined)
    )?.trim();

    if (!target && process.stdout.isTTY) {
        const v = await text({
            message: 'User id or email:',
            placeholder: 'e.g. admin or you@example.com'
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        target = (v as string)?.trim();
    }
    if (!target) {
        console.error('User id or email required (use --user=, --email=, or --id=).');
        process.exit(1);
    }

    let newPassword = args.password as string | undefined;
    if (!newPassword && process.stdout.isTTY) {
        const v = await passwordPrompt({
            message: `New password (min ${MIN_PASSWORD_LEN} chars):`,
            validate: (value: string | undefined) =>
                value && value.length >= MIN_PASSWORD_LEN
                    ? undefined
                    : `At least ${MIN_PASSWORD_LEN} characters`
        });
        if (isCancel(v)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        newPassword = v as string;
        const again = await passwordPrompt({ message: 'Confirm new password:' });
        if (isCancel(again)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        if (again !== newPassword) {
            console.error('Passwords do not match.');
            process.exit(1);
        }
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
        console.error(
            `Password must be at least ${MIN_PASSWORD_LEN} characters (use --password= in CI only).`
        );
        process.exit(1);
    }

    const { setUserPasswordHash } = await import('@moteurio/core/users.js');
    const { hashPassword } = await import('@moteurio/core/auth.js');
    const { storageConfig } = await import('@moteurio/core/config/storageConfig.js');

    try {
        const updated = setUserPasswordHash(target, await hashPassword(newPassword));
        if (args.json) {
            const { passwordHash: _, auth: __, ...safe } = updated;
            console.log(JSON.stringify(safe, null, 2));
            return;
        }
        console.log('✅ Password updated for:', updated.email, `(${updated.id})`);
        console.log('   Users file:', storageConfig.usersFile);
    } catch (err) {
        console.error('❌', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

export async function listUsersCommand(args: Record<string, unknown>): Promise<void> {
    const client = await getClientOrThrow();
    const projectId = args.project as string;
    if (!projectId) {
        console.error('Use: moteur auth list --project=<projectId>');
        process.exit(1);
    }
    try {
        const { users } = await client.projects.users(projectId);
        if (args.json) {
            console.log(JSON.stringify(users ?? [], null, 2));
            return;
        }
        console.log('👤 Project users:');
        (users ?? []).forEach(u => {
            const presence = u.online ? 'online' : 'offline';
            const last = u.lastLoginAt ?? '—';
            const name = u.name ? ` (${u.name})` : '';
            console.log(`  ${u.id}${name} | ${u.email} | ${presence} | last login: ${last}`);
        });
    } catch (err) {
        console.error('❌', err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

cliRegistry.register('auth', {
    name: 'login',
    description: 'Log in and save token to config',
    action: loginCommand
});
cliRegistry.register('auth', {
    name: 'logout',
    description: 'Clear saved config',
    action: logoutCommand
});
cliRegistry.register('auth', {
    name: 'whoami',
    description: 'Show current user',
    action: whoamiCommand
});
cliRegistry.register('auth', {
    name: 'list',
    description: 'List project users (use --project=id)',
    action: listUsersCommand
});
cliRegistry.register('auth', {
    name: 'create-user',
    description: 'Create user in local users.json (no API login; optional --project=)',
    action: createUserCommand
});
cliRegistry.register('auth', {
    name: 'reset-password',
    description: 'Reset user password in local users.json (--user= id or email; --password=)',
    action: resetPasswordCommand
});
cliRegistry.register('auth', {
    name: '',
    description: 'Auth menu',
    action: async () => {
        const sub = await select({
            message: 'Auth',
            options: [
                { value: 'login', label: 'Login' },
                { value: 'logout', label: 'Logout' },
                { value: 'whoami', label: 'Who am I?' }
            ]
        });
        if (isCancel(sub)) {
            cancel('Cancelled.');
            process.exit(0);
        }
        if (sub === 'login') await loginCommand({});
        else if (sub === 'logout') await logoutCommand();
        else await whoamiCommand();
    }
});
