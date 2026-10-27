/** One place an entry or a page points at a page or an entry: a link to a page, or a relation. */
export interface ContentReference {
    from: { kind: 'entry' | 'page'; id: string; modelId?: string; label?: string };
    /** Where in the record, e.g. `hero.cta` or `body[2].data.link`. */
    path: string;
    via: 'link' | 'relation';
    to: { kind: 'page'; id: string } | { kind: 'entry'; modelId: string; id: string };
}
