/**
 * Accounts made straight in a local server’s files (users.json), for setting a server up before
 * anyone can sign in. Everything else goes through the API.
 */
import { randomUUID } from 'node:crypto';
import { text, password as passwordPrompt, isCancel, cancel } from '@clack/prompts';
import { config as loadDotenv } from 'dotenv';
import type { ProjectSchema } from '@moteurio/types/Project.js';
import { isWebSessionMode } from '@moteurio/commands';

const MIN_PASSWORD_LEN = 8;

/** The engine's password rule, so a password set here can also sign in through the API. */
async function passwordRefusal(password: string | undefined): Promise<string | null> {
    if (!password) return 'A password is required';
    const { passwordProblem } = await import('@moteurio/core/auth.js');
    return passwordProblem(password);
}

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
    await addProjectToUser(userId, projectId);
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
    const weak = await passwordRefusal(password);
    if (weak || !password) {
        console.error(`${weak} (use --password= in CI only).`);
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
        roles: [],
        projects: [] as string[],
        isActive: true
    };

    try {
        await createUser(user);
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
    const weakNew = await passwordRefusal(newPassword);
    if (weakNew || !newPassword) {
        console.error(`${weakNew} (use --password= in CI only).`);
        process.exit(1);
    }

    const { setUserPasswordHash } = await import('@moteurio/core/users.js');
    const { hashPassword } = await import('@moteurio/core/auth.js');
    const { storageConfig } = await import('@moteurio/core/config/storageConfig.js');

    try {
        const updated = await setUserPasswordHash(target, await hashPassword(newPassword));
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
