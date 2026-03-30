import type { Field } from '@moteurio/types/Field.js';
import type { Layout } from '@moteurio/types/Layout.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { getProjectJson } from '../utils/projectStorage.js';
import { layoutKey } from '../utils/storageKeys.js';
import { BlockRegistry } from '../registry/BlockRegistry.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import { validateFieldValue } from './validateFieldValue.js';

function slotIdForLayoutBlock(block: Layout['blocks'][number], index: number): string {
    const mid = block.meta?.id;
    if (typeof mid === 'string' && mid.trim()) return mid.trim();
    return String(index);
}

/**
 * For each core/layout field, load the project Layout and validate slot data
 * against the corresponding block schema.
 */
export async function validateLayoutFieldValues(
    projectId: string,
    fields: Record<string, unknown> | undefined,
    schemaFields: Record<string, Field>,
    pathPrefix: string,
    options?: {
        projectLocales?: string[];
        allowHtmlIframe?: boolean;
        allowHtmlEmbed?: boolean;
    }
): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const blockRegistry = new BlockRegistry(projectId);

    for (const [fieldKey, fieldSchema] of Object.entries(schemaFields)) {
        if (fieldSchema.type !== 'core/layout') continue;

        const value = fields?.[fieldKey];
        if (value === undefined || value === null) continue;
        if (typeof value !== 'object' || Array.isArray(value)) continue;

        const path = `${pathPrefix}.${fieldKey}`;
        const layoutId = (value as Record<string, unknown>).layoutId;
        if (typeof layoutId !== 'string' || !layoutId.trim()) continue;

        const layout = await getProjectJson<Layout>(projectId, layoutKey(layoutId.trim()));
        if (!layout || !Array.isArray(layout.blocks)) {
            issues.push({
                type: 'error',
                code: 'LAYOUT_RESOURCE_NOT_FOUND',
                message: `Layout "${layoutId}" was not found in this project.`,
                path: `${path}.layoutId`
            });
            continue;
        }

        const slots = (value as Record<string, unknown>).slots;
        if (!Array.isArray(slots)) continue;

        const slotToBlock = new Map<string, Layout['blocks'][number]>();
        layout.blocks.forEach((b, i) => {
            slotToBlock.set(slotIdForLayoutBlock(b, i), b);
        });

        const seen = new Set<string>();
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i] as Record<string, unknown>;
            const sp = `${path}.slots[${i}]`;
            if (!slot || typeof slot.id !== 'string') continue;

            const sid = slot.id.trim();
            if (seen.has(sid)) {
                issues.push({
                    type: 'error',
                    code: 'LAYOUT_DUPLICATE_SLOT',
                    message: `Duplicate slot id "${sid}".`,
                    path: sp
                });
            }
            seen.add(sid);

            const layoutBlock = slotToBlock.get(sid);
            if (!layoutBlock) {
                issues.push({
                    type: 'error',
                    code: 'LAYOUT_UNKNOWN_SLOT',
                    message: `Slot id "${sid}" does not match any block in layout "${layoutId}". Use block meta.id or index as string.`,
                    path: `${sp}.id`
                });
                continue;
            }

            const blockSchema = blockRegistry.get(layoutBlock.type);
            if (!blockSchema) {
                issues.push({
                    type: 'error',
                    code: 'LAYOUT_BLOCK_SCHEMA_MISSING',
                    message: `Unknown block type "${layoutBlock.type}" in layout.`,
                    path: `${sp}.id`
                });
                continue;
            }

            const data =
                slot.data && typeof slot.data === 'object' && !Array.isArray(slot.data)
                    ? (slot.data as Record<string, unknown>)
                    : {};

            const schemaFieldsBlock = blockSchema.fields || {};
            for (const [fname, fdef] of Object.entries(schemaFieldsBlock)) {
                const fieldDef = fdef as Field;
                const fieldValue = data[fname];
                const fieldPath = `${sp}.data.${fname}`;

                if (fieldValue === undefined || fieldValue === null) {
                    if (fieldDef.required === true) {
                        issues.push({
                            type: 'error',
                            code: 'LAYOUT_SLOT_REQUIRED_FIELD',
                            message: `Required field "${fname}" is missing for slot "${sid}".`,
                            path: fieldPath
                        });
                    }
                    continue;
                }

                if (!fieldRegistry.has(fieldDef.type)) {
                    issues.push({
                        type: 'error',
                        code: 'LAYOUT_SLOT_UNKNOWN_FIELD_TYPE',
                        message: `Field "${fname}" uses unknown type "${fieldDef.type}".`,
                        path: fieldPath
                    });
                    continue;
                }

                issues.push(
                    ...validateFieldValue(fieldValue, fieldDef, fieldPath, {
                        projectId,
                        allowHtmlIframe: options?.allowHtmlIframe === true,
                        allowHtmlEmbed: options?.allowHtmlEmbed === true
                    })
                );
            }
        }

        void options?.projectLocales;
    }

    return issues;
}
