/**
 * Create a read-only API key for the Journal demo (project demo, collection public).
 *
 * Usage (API must be running):
 *   pnpm exec tsx --tsconfig tsconfig.server-dev.json scripts/create-demo-api-key.ts \
 *     --api-url http://localhost:3000 \
 *     --email louise@moteur-journal.test --password demo123
 */
import { createMoteurAdminClient } from '@moteurio/client';

function arg(name: string, fallback?: string): string {
    const i = process.argv.indexOf(`--${name}`);
    if (i === -1 || !process.argv[i + 1]) {
        if (fallback !== undefined) return fallback;
        console.error(`Missing --${name}`);
        process.exit(1);
    }
    return process.argv[i + 1];
}

const apiUrl = arg('api-url', 'http://localhost:3000').replace(/\/$/, '');
const projectId = arg('project', 'demo');
const collectionId = arg('collection', 'public');
const email = arg('email', 'louise@moteur-journal.test');
const password = arg('password', 'demo123');
const label = arg('label', 'Local starter');

async function main() {
    const loginClient = createMoteurAdminClient({ baseURL: apiUrl });
    const { token } = await loginClient.auth.login(email, password);
    const client = createMoteurAdminClient({
        baseURL: apiUrl,
        auth: { type: 'bearer', token }
    });
    const created = await client.forProject(projectId).apiKeys.create({
        label,
        allowedCollectionIds: [collectionId],
        allowSiteWideReads: true
    });
    const rawKey = created.rawKey;
    if (!rawKey) {
        console.error(
            'API did not return rawKey (key may already exist — create a new one in Studio).'
        );
        process.exit(1);
    }
    console.log(`MOTEUR_API_URL=${apiUrl}`);
    console.log(`MOTEUR_PROJECT_ID=${projectId}`);
    console.log(`MOTEUR_COLLECTION_ID=${collectionId}`);
    console.log(`MOTEUR_API_KEY=${rawKey}`);
}

main().catch(err => {
    console.error(err?.message ?? err);
    process.exit(1);
});
