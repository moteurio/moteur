import type { ModelSchema } from './Model.js';
import type { StructureSchema } from './Structure.js';
import type { Field } from './Field.js';
import type { ImportBundle } from './Import.js';

/** Discriminator for blueprint kind. Default is 'project' when omitted. */
export type BlueprintKind = 'project' | 'model' | 'structure' | 'template';

/**
 * Template for a model blueprint (kind === 'model').
 * Single model schema to instantiate in a project.
 */
export interface ModelBlueprintTemplate {
    model: ModelSchema;
}

/**
 * Template for a structure blueprint (kind === 'structure').
 * Single structure schema to instantiate in a project.
 */
export interface StructureBlueprintTemplate {
    structure: StructureSchema;
}

/**
 * Reusable page template schema (without projectId, timestamps).
 * Used when creating a template in a project from a template blueprint.
 */
export interface TemplateBlueprintTemplateSchema {
    id?: string;
    label: string;
    description?: string;
    fields: Record<string, Field>;
}

/**
 * Template for a template blueprint (kind === 'template').
 * Single page template schema to instantiate in a project.
 */
export interface TemplateBlueprintTemplate {
    template: TemplateBlueprintTemplateSchema;
}

/**
 * Blueprint: reusable template with metadata.
 * - kind 'project' (or omitted): `bundle`, an import bundle: what a new project starts with
 *   (schemas, files, pages, entries, menus), imported when the project is made from it.
 * - kind 'model': template is ModelBlueprintTemplate (single model).
 * - kind 'structure': template is StructureBlueprintTemplate (single structure).
 * - kind 'template': template is TemplateBlueprintTemplate (single page template).
 */
export interface BlueprintSchema {
    id: string;
    name: string;
    description?: string;
    kind?: BlueprintKind;
    /**
     * Offer this starting point to a new person making their first project. For project
     * blueprints; an operator marks them.
     */
    firstProject?: boolean;
    /** A project blueprint's content: imported, all or nothing, into a project made from it. */
    bundle?: ImportBundle;
    /**
     * The languages its bundle is written in, its main one first (default `["en"]`). A project
     * made from it gets the content in its own languages: the main one's where it has none.
     */
    languages?: string[];
    template?: ModelBlueprintTemplate | StructureBlueprintTemplate | TemplateBlueprintTemplate;
}

/** A project blueprint as a list gives it: what it is and what it holds, without the bundle. */
export interface BlueprintSummary extends Omit<BlueprintSchema, 'bundle' | 'template'> {
    /** How many of each the project starts with. */
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
