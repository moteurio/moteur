import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
// The API package's entry point, built by `pnpm -r build`.
const serverEntry = path.join(repoRoot, 'packages/api/dist/index.js');

export interface E2eTarget {
    baseURL: string;
    email: string;
    password: string;
    /** True when the suite started the server itself, false when it runs against MOTEUR_E2E_URL. */
    local: boolean;
    stop(): Promise<void>;
}

/**
 * Returns the server the suite runs against. With MOTEUR_E2E_URL set, that server is used as is
 * (a deployed instance, for a smoke test after deploy) and MOTEUR_E2E_EMAIL and
 * MOTEUR_E2E_PASSWORD must name an existing account. Otherwise the built server is started on a
 * temporary data folder with one admin account, and removed again by stop().
 */
export async function startTarget(): Promise<E2eTarget> {
    const url = process.env.MOTEUR_E2E_URL?.trim();
    if (url) {
        const email = process.env.MOTEUR_E2E_EMAIL?.trim();
        const password = process.env.MOTEUR_E2E_PASSWORD;
        if (!email || !password)
            throw new Error('MOTEUR_E2E_URL needs MOTEUR_E2E_EMAIL and MOTEUR_E2E_PASSWORD');
        return {
            baseURL: url.replace(/\/$/, ''),
            email,
            password,
            local: false,
            stop: async () => {}
        };
    }
    return startLocalServer();
}

async function startLocalServer(): Promise<E2eTarget> {
    if (!existsSync(serverEntry))
        throw new Error(`${serverEntry} is missing. Run \`pnpm build\` before the e2e tests.`);

    const root = await mkdtemp(path.join(tmpdir(), 'moteur-e2e-'));
    const email = 'e2e-admin@moteur.test';
    const password = randomBytes(12).toString('hex');
    await mkdir(path.join(root, 'data/projects'), { recursive: true });
    const { hashPassword } = await import('@moteurio/core/auth.js');
    await writeFile(
        path.join(root, 'data/users.json'),
        JSON.stringify([
            {
                id: 'e2e-admin',
                email,
                name: 'E2E Admin',
                passwordHash: await hashPassword(password),
                roles: ['admin'],
                projects: [],
                isActive: true
            }
        ])
    );

    const port = await freePort();
    const child = spawn(process.execPath, [serverEntry], {
        cwd: root,
        env: serverEnv(root, port),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout?.on('data', chunk => (log += chunk));
    child.stderr?.on('data', chunk => (log += chunk));

    const baseURL = `http://127.0.0.1:${port}`;
    try {
        await waitUntilAnswering(baseURL, child, () => log);
    } catch (err) {
        child.kill('SIGKILL');
        await rm(root, { recursive: true, force: true });
        throw err;
    }

    return {
        baseURL,
        email,
        password,
        local: true,
        async stop() {
            await stopProcess(child);
            await rm(root, { recursive: true, force: true });
        }
    };
}

/**
 * The server's environment. The API loads the repository's .env with dotenv, which never
 * overrides a variable that is already set, so every variable named there is set here too:
 * to the test's own value, or to an empty string. Otherwise a developer's .env (users file,
 * projects folder, AI keys) would leak into the test.
 */
function serverEnv(root: string, port: number): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        // An empty home folder: no global Git config, as on a fresh server or CI machine.
        HOME: root
    };
    const dotenvPath = path.join(repoRoot, '.env');
    if (existsSync(dotenvPath)) {
        for (const line of readFileSync(dotenvPath, 'utf8').split('\n')) {
            const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
            if (match) env[match[1]] = '';
        }
    }
    return {
        ...env,
        NODE_ENV: 'test',
        DATA_ROOT: root,
        AUTH_USERS_FILE: path.join(root, 'data/users.json'),
        PROJECTS_DIR: path.join(root, 'data/projects'),
        PORT: String(port),
        JWT_SECRET: randomBytes(32).toString('hex'),
        MOTEUR_AI_PROVIDER: 'mock',
        MOTEUR_AI_CREDITS_DISABLED: '1'
    };
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

async function waitUntilAnswering(
    baseURL: string,
    child: ChildProcess,
    log: () => string
): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null)
            throw new Error(`The server exited with code ${child.exitCode}:\n${log()}`);
        try {
            // Any HTTP answer means the server is listening.
            await fetch(baseURL);
            return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    throw new Error(`The server did not answer within 30 seconds:\n${log()}`);
}

function stopProcess(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
        child.once('exit', () => {
            clearTimeout(timer);
            resolve();
        });
        child.kill('SIGTERM');
    });
}
