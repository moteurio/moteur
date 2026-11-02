/**
 * One view per page template, checked: `defineTemplates<MoteurSchema>({ home: Home, … })` fails
 * `astro check` when a template has no view, or a view reads fields its template doesn't have.
 */
import type { SchemaShape } from '@moteurio/client';

/** What a view reads of any page: its template and address. */
export type DeliveredPageLike = { templateId: string; path: string };

/** The project's pages, in one language, as the loader gives them (from `moteur types`). */
type PagesOf<S extends SchemaShape> = S['one'] extends {
    pages: infer P extends DeliveredPageLike;
}
    ? P & { locale: S['locale'] }
    : DeliveredPageLike & { locale: string };

/** A page as the `moteurPages` loader gives it: typed by its template, with its `locale`. */
export type SitePage<S extends SchemaShape> = PagesOf<S>;

/** The project's template ids. */
export type TemplateId<S extends SchemaShape> = PagesOf<S>['templateId'];

/** A page of one template, as the loader gives it: `PageOf<MoteurSchema, 'home'>`. */
export type PageOf<S extends SchemaShape, T extends TemplateId<S>> = Extract<
    PagesOf<S>,
    { templateId: T }
>;

/**
 * What a template's view is given: `type Props = ViewProps<MoteurSchema, 'home'>`. The page,
 * its fields typed by the template, with `path`, `paths` and `locale`.
 */
export type ViewProps<S extends SchemaShape, T extends TemplateId<S>> = {
    page: PageOf<S, T>;
};

/** An Astro component (or any function component) for a template. */
export type TemplateView<P extends DeliveredPageLike> = (props: { page: P }) => unknown;

/** A view for every template of the project, by its id. */
export type TemplateViews<S extends SchemaShape> = {
    [P in PagesOf<S> as P['templateId']]: TemplateView<P>;
};

export interface DefinedTemplates {
    /** The view for this page, or nothing for a template the site doesn't know yet. */
    for(page: DeliveredPageLike): TemplateView<DeliveredPageLike> | undefined;
}

const warned = new Set<string>();

export function defineTemplates<S extends SchemaShape>(views: TemplateViews<S>): DefinedTemplates {
    const map = views as unknown as Record<string, TemplateView<DeliveredPageLike>>;
    return {
        for(page) {
            const found = map[page.templateId];
            if (!found && !warned.has(page.templateId)) {
                // A template made in Studio before the site has a view for it: its pages wait.
                warned.add(page.templateId);
                console.warn(
                    `[moteur] No view for template "${page.templateId}": its pages (${page.path}, …) are not built.`
                );
            }
            return found;
        }
    };
}
