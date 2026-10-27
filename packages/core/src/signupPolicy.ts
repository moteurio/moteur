/**
 * Whether this server makes accounts for people nobody invited: `MOTEUR_SIGNUP=open`. Closed by
 * default, so a forgotten server doesn't take strangers; invited people can always join.
 */
export function signupOpen(): boolean {
    return process.env.MOTEUR_SIGNUP?.trim().toLowerCase() === 'open';
}
