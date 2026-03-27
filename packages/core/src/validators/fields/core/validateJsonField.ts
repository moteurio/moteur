import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { Field } from '@moteurio/types/Field.js';
import { ValidationIssue } from '@moteurio/types/ValidationResult.js';
import { isPlainObject } from '../../fieldValueUtils.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compileCache = new WeakMap<object, ReturnType<typeof ajv.compile>>();

function getValidator(schema: object) {
    let v = compileCache.get(schema);
    if (!v) {
        v = ajv.compile(schema);
        compileCache.set(schema, v);
    }
    return v;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
    if (!errors?.length) return 'JSON Schema validation failed.';
    return errors.map(e => `${e.instancePath || '/'} ${e.message ?? ''}`.trim()).join('; ');
}

export function validateJsonField(value: any, field: Field, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allowEmpty = field.options?.allowEmpty === true;

    if (value === undefined || value === null) {
        if (!allowEmpty) {
            issues.push({
                type: 'error',
                code: 'JSON_EMPTY',
                message: 'JSON field cannot be empty.',
                path,
                context: { value }
            });
        }
        return issues;
    }

    let parsed: unknown = value;
    if (typeof value === 'string') {
        if (allowEmpty && value.trim() === '') return issues;
        try {
            parsed = JSON.parse(value);
        } catch {
            issues.push({
                type: 'error',
                code: 'JSON_INVALID',
                message: 'Value is not valid JSON.',
                path,
                context: { value }
            });
            return issues;
        }
    }

    if (typeof parsed !== 'object' || parsed === null) {
        issues.push({
            type: 'error',
            code: 'JSON_INVALID_TYPE',
            message: 'JSON field must be a string or object.',
            path,
            context: { value }
        });
        return issues;
    }

    let data = parsed as Record<string, unknown>;
    if (isPlainObject(data) && 'value' in data && Object.keys(data).length === 1) {
        data = data.value as Record<string, unknown>;
    }

    const schema = field.options?.schema;
    if (schema && isPlainObject(schema)) {
        try {
            const validate = getValidator(schema as object);
            const ok = validate(data);
            if (!ok) {
                issues.push({
                    type: 'error',
                    code: 'JSON_SCHEMA_VIOLATION',
                    message: formatAjvErrors(validate.errors),
                    path,
                    context: { errors: validate.errors, value: data }
                });
            }
        } catch (e) {
            issues.push({
                type: 'error',
                code: 'JSON_SCHEMA_INVALID',
                message: `Invalid JSON Schema in field options: ${e instanceof Error ? e.message : String(e)}`,
                path,
                context: { value }
            });
        }
    }

    return issues;
}
