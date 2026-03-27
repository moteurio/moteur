export function isGitHubEnabled() {
    return !!(
        process.env.AUTH_GITHUB_CLIENT_ID &&
        process.env.AUTH_GITHUB_CLIENT_SECRET &&
        process.env.AUTH_GITHUB_REDIRECT_URI
    );
}

export function isGoogleEnabled() {
    return !!(
        process.env.AUTH_GOOGLE_CLIENT_ID &&
        process.env.AUTH_GOOGLE_CLIENT_SECRET &&
        process.env.AUTH_GOOGLE_REDIRECT_URI
    );
}
