import { BlockRegistry } from '../registry/BlockRegistry.js';
import fieldRegistry from '../registry/FieldRegistry.js';
import { validateFieldValue } from './validateFieldValue.js';
import type { Field } from '@moteurio/types/Field.js';
import type { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import type { Block } from '@moteurio/types/Block.js';

export interface ValidateBlockInstancesOptions {
    /** When set, block schemas include project-scoped definitions (data/projects/&lt;id&gt;/blocks). */
    projectId?: string;
    allowHtmlIframe?: boolean;
    allowHtmlEmbed?: boolean;
    /** Project locales for block.locales validation */
    projectLocales?: string[];
    /** If set, each block `type` must be in this list */
    allowedBlockTypes?: string[];
    minBlocks?: number;
    maxBlocks?: number;
    /**
     * Issue code prefix for Layout resource validation (backward compatible).
     * Default: BLOCK_* / generic codes for core/block-list fields.
     */
    issuePrefix?: 'layout' | 'blockList';
}

/**
 * Validates an array of block instances (same shape as Layout.blocks).
 * Shared by Layout validation, core/block-list fields, and core/layout slot payloads.
 */
export function validateBlockInstances(
    blocks: unknown,
    pathPrefix: string,
    options?: ValidateBlockInstancesOptions
): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const blockRegistry = new BlockRegistry(options?.projectId);

    const p = options?.issuePrefix ?? 'blockList';

    if (!Array.isArray(blocks)) {
        issues.push({
            type: 'error',
            code: p === 'layout' ? 'LAYOUT_MISSING_BLOCKS' : 'BLOCKS_NOT_ARRAY',
            message:
                p === 'layout'
                    ? 'Layout must contain a "blocks" array.'
                    : 'Value must be an array of blocks.',
            path: pathPrefix
        });
        return issues;
    }

    const min = options?.minBlocks ?? 0;
    const max = options?.maxBlocks;
    if (blocks.length < min) {
        issues.push({
            type: 'error',
            code: 'BLOCK_LIST_TOO_FEW',
            message: `At least ${min} block(s) required; got ${blocks.length}.`,
            path: pathPrefix
        });
    }
    if (max != null && blocks.length > max) {
        issues.push({
            type: 'error',
            code: 'BLOCK_LIST_TOO_MANY',
            message: `At most ${max} block(s) allowed; got ${blocks.length}.`,
            path: pathPrefix
        });
    }

    const allowed = options?.allowedBlockTypes;

    blocks.forEach((blockInstance: Block, index: number) => {
        const blockPath = `${pathPrefix}[${index}]`;
        const blockType = blockInstance?.type;

        if (!blockType || typeof blockType !== 'string') {
            issues.push({
                type: 'error',
                code: p === 'layout' ? 'LAYOUT_UNKNOWN_BLOCK_TYPE' : 'BLOCK_MISSING_TYPE',
                message:
                    p === 'layout'
                        ? 'Block must have a known string "type".'
                        : 'Block must have a string "type".',
                path: `${blockPath}.type`
            });
            return;
        }

        if (allowed?.length && !allowed.includes(blockType)) {
            issues.push({
                type: 'error',
                code: 'BLOCK_TYPE_NOT_ALLOWED',
                message: `Block type "${blockType}" is not allowed for this field.`,
                path: `${blockPath}.type`
            });
            return;
        }

        const blockSchema = blockRegistry.get(blockType);
        if (!blockSchema) {
            issues.push({
                type: 'error',
                code: p === 'layout' ? 'LAYOUT_UNKNOWN_BLOCK_TYPE' : 'UNKNOWN_BLOCK_TYPE',
                message: `Unknown block type "${blockType}".`,
                path: `${blockPath}.type`
            });
            return;
        }

        const schemaFields = blockSchema.fields || {};
        for (const fieldName of Object.keys(schemaFields)) {
            const fieldDef = schemaFields[fieldName] as Field;
            const fieldValue = blockInstance.data?.[fieldName];
            const fieldPath = `${blockPath}.data.${fieldName}`;

            if (fieldValue === undefined || fieldValue === null) {
                const isRequired = fieldDef.required === true;
                issues.push({
                    type: isRequired ? 'error' : 'warning',
                    code:
                        p === 'layout'
                            ? isRequired
                                ? 'LAYOUT_REQUIRED_FIELD'
                                : 'LAYOUT_MISSING_FIELD'
                            : isRequired
                              ? 'BLOCK_REQUIRED_FIELD'
                              : 'BLOCK_MISSING_FIELD',
                    message: isRequired
                        ? `Required field "${fieldName}" is missing.`
                        : `Optional field "${fieldName}" has no value.`,
                    path: fieldPath
                });
                continue;
            }

            if (!fieldRegistry.has(fieldDef.type)) {
                issues.push({
                    type: 'error',
                    code: p === 'layout' ? 'LAYOUT_UNKNOWN_FIELD_TYPE' : 'BLOCK_UNKNOWN_FIELD_TYPE',
                    message: `Field "${fieldName}" uses unknown field type "${fieldDef.type}".`,
                    path: fieldPath
                });
                continue;
            }

            issues.push(
                ...validateFieldValue(fieldValue, fieldDef, fieldPath, {
                    projectId: options?.projectId,
                    allowHtmlIframe: options?.allowHtmlIframe === true,
                    allowHtmlEmbed: options?.allowHtmlEmbed === true
                })
            );
        }

        if (blockInstance.locales != null) {
            if (!Array.isArray(blockInstance.locales)) {
                issues.push({
                    type: 'error',
                    code: p === 'layout' ? 'LAYOUT_INVALID_LOCALES' : 'BLOCK_INVALID_LOCALES',
                    message: '"locales" should be an array of locale codes.',
                    path: `${blockPath}.locales`
                });
            } else if (options?.projectLocales?.length) {
                const invalid = blockInstance.locales.filter(
                    (lc: string) => !options.projectLocales!.includes(lc)
                );
                if (invalid.length > 0) {
                    issues.push({
                        type: 'error',
                        code:
                            p === 'layout'
                                ? 'LAYOUT_INVALID_LOCALE_CODES'
                                : 'BLOCK_INVALID_LOCALE_CODES',
                        message: `Invalid locale code(s): ${invalid.join(', ')}. Must be one of: ${options.projectLocales.join(', ')}.`,
                        path: `${blockPath}.locales`
                    });
                }
            }
        }

        if (blockInstance.conditions && typeof blockInstance.conditions !== 'object') {
            issues.push({
                type: 'warning',
                code: p === 'layout' ? 'LAYOUT_INVALID_CONDITIONS' : 'BLOCK_INVALID_CONDITIONS',
                message: '"conditions" should be an object with condition rules.',
                path: `${blockPath}.conditions`
            });
        }
    });

    return issues;
}
