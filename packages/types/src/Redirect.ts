/** The HTTP status of a redirect: 301 for a permanent move, 302 for a temporary one. */
export type RedirectStatus = 301 | 302;

/** A redirect from one URL path to another address. */
export interface Redirect {
    id: string;
    /** The path to redirect from. It starts with "/" and has no query string or fragment. */
    from: string;
    /** The destination: a path on the site, or a full http(s) URL. */
    to: string;
    status: RedirectStatus;
    /** True when Moteur created the redirect automatically because the URL of a published page or entry changed. */
    auto?: boolean;
    note?: string;
    createdAt: string;
    updatedAt: string;
}
