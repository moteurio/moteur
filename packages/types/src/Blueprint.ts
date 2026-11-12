import type { ModelSchema } from './Model.js';
import type { StructureSchema } from './Structure.js';
import type { Field } from './Field.js';
import type { ImportBundle } from './Import.js';

/** The kind of a blueprint. Defaults to `project` when omitted. */
export type BlueprintKind = 'project' | 'model' | 'structure' | 'template';

/**
 * Template of a model blueprint (`kind` is `model`): a single model schema to create in a project.
 */
export interface ModelBlueprintTemplate {
    model: ModelSchema;
}

/**
 * Template of a structure blueprint (`kind` is `structure`): a single structure schema to create
 * in a project.
 */
export interface StructureBlueprintTemplate {
    structure: StructureSchema;
}

/**
 * A page template schema without `projectId` or timestamps. It is used when a template is created
 * in a project from a template blueprint.
 */
export interface TemplateBlueprintTemplateSchema {
    id?: string;
    label: string;
    description?: string;
    fields: Record<string, Field>;
}

/**
 * Template of a template blueprint (`kind` is `template`): a single page template schema to create
 * in a project.
 */
export interface TemplateBlueprintTemplate {
    template: TemplateBlueprintTemplateSchema;
}

/**
 * A reusable blueprint with metadata. What it holds depends on `kind`:
 * - `project` (or omitted): `bundle` is an import bundle with the initial content of a new
 *   project (schemas, files, pages, entries, menus). It is imported when a project is created
 *   from the blueprint.
 * - `model`: `template` is a `ModelBlueprintTemplate` (a single model).
 * - `structure`: `template` is a `StructureBlueprintTemplate` (a single structure).
 * - `template`: `template` is a `TemplateBlueprintTemplate` (a single page template).
 */
export interface BlueprintSchema {
    id: string;
    name: string;
    description?: string;
    kind?: BlueprintKind;
    /**
     * When true, this blueprint is offered as a starting point to users creating their first
     * project. Applies to project blueprints only, and is set by an operator.
     */
    firstProject?: boolean;
    /** Content of a project blueprint. It is imported as a single all-or-nothing operation into a project created from the blueprint. */
    bundle?: ImportBundle;
    /**
     * Locales the bundle's content is written in, with the main locale first. Defaults to
     * `["en"]`. A project created from the blueprint receives the content in its own locales, and
     * uses the main locale's content for locales the bundle does not cover.
     */
    languages?: string[];
    template?: ModelBlueprintTemplate | StructureBlueprintTemplate | TemplateBlueprintTemplate;
}

/** A project blueprint as returned in lists: its metadata and a summary of its content, without the bundle. */
export interface BlueprintSummary extends Omit<BlueprintSchema, 'bundle' | 'template'> {
    /** Number of items of each kind that a new project starts with. */
    contains?: Partial<
        Record<
            | 'templates'
            | 'models'
            | 'blocks'
            | 'structures'
            | 'pages'
            | 'entries'
            | 'files'
            | 'menus'
            | 'forms',
            number
        >
    >;
}
