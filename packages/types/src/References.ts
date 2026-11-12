/** One reference from an entry or page to a page or entry, either a link to a page or a relation. */
export interface ContentReference {
    from: { kind: 'entry' | 'page'; id: string; modelId?: string; label?: string };
    /** Location of the reference within the record, for example `hero.cta` or `body[2].data.link`. */
    path: string;
    via: 'link' | 'relation';
    to: { kind: 'page'; id: string } | { kind: 'entry'; modelId: string; id: string };
}
