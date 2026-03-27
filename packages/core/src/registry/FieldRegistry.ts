import { FieldSchema } from '@moteurio/types/Field.js';

class FieldRegistry {
    private fieldTypes: Record<string, FieldSchema> = {};

    register(field: FieldSchema): FieldSchema {
        if (!field.type) {
            throw new Error('Field must have a "type" property.');
        }
        if (!field.type.includes('/')) {
            throw new Error(`Field type "${field.type}" must be namespaced (e.g., "core/text")`);
        }

        if (this.fieldTypes[field.type]) {
            throw new Error(`Field type ${field.type} is already registered.`);
        }
        this.fieldTypes[field.type] = field;
        return field;
    }

    get(type: string): FieldSchema {
        const fieldSchema = this.fieldTypes[type];
        if (!fieldSchema) {
            throw new Error(`Field type "${type}" not found in registry.`);
        }
        return fieldSchema;
    }

    has(type: string): boolean {
        return type in this.fieldTypes;
    }

    all(): Record<string, FieldSchema> {
        return this.fieldTypes;
    }
}

const fieldRegistry = new FieldRegistry();
export default fieldRegistry;
