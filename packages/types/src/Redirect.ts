/** A permanent (301) or temporary (302) move from one address to another. */
export type RedirectStatus = 301 | 302;

export interface Redirect {
    id: string;
    /** The old path, starting with "/" (no query or fragment). */
    from: string;
    /** A path on the site, or a full http(s) URL. */
    to: string;
    status: RedirectStatus;
    /** Made by Moteur when a live page or entry changed address. */
    auto?: boolean;
    note?: string;
    createdAt: string;
    updatedAt: string;
}
