import type { ModelSchema } from '@moteurio/types/Model.js';

const templates = new Map<string, ModelSchema>();

export function registerModelTemplate(schema: ModelSchema): void {
    if (!schema?.id) return;
    templates.set(schema.id, schema);
}

export function listModelTemplates(): ModelSchema[] {
    return [...templates.values()];
}

export function getModelTemplate(id: string): ModelSchema | undefined {
    return templates.get(id);
}

export function resetModelTemplates(): void {
    templates.clear();
}
