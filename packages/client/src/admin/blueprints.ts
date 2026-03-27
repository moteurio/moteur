import type { MoteurClient } from '../client.js';

type BlueprintKind = 'project' | 'model' | 'structure' | 'template';

function kindPath(kind: BlueprintKind): string {
    return `/blueprints/${kind}s`;
}

export function blueprintsApi(client: MoteurClient) {
    return {
        list(kind: BlueprintKind): Promise<{ blueprints: Record<string, unknown>[] }> {
            return client.get(kindPath(kind));
        },
        get(kind: BlueprintKind, blueprintId: string): Promise<Record<string, unknown>> {
            return client.get(`${kindPath(kind)}/${encodeURIComponent(blueprintId)}`);
        },
        create(
            kind: BlueprintKind,
            body: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
            return client.post(kindPath(kind), { ...body, kind });
        },
        update(
            kind: BlueprintKind,
            blueprintId: string,
            body: Record<string, unknown>
        ): Promise<Record<string, unknown>> {
            return client.patch(`${kindPath(kind)}/${encodeURIComponent(blueprintId)}`, body);
        },
        delete(kind: BlueprintKind, blueprintId: string): Promise<void> {
            return client.delete(`${kindPath(kind)}/${encodeURIComponent(blueprintId)}`);
        }
    };
}
