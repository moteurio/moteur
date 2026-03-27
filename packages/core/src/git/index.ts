export {
    initRepo,
    cloneFromRemote,
    writeGitignore,
    addAndCommit,
    addAllAndCommit,
    getLog,
    getRepoLog,
    show,
    setRemoteOrigin,
    push,
    pushBranch,
    isGitRepo,
    GITIGNORE_LINES,
    getCurrentBranch,
    listBranches,
    createBranch,
    checkoutBranch,
    mergeBranch,
    snapshotWorkspace,
    restoreWorkspace,
    snapshotUserData,
    restoreUserData,
    WORKSPACE_SNAPSHOT_BRANCH,
    USERDATA_SNAPSHOT_BRANCH
} from './gitService.js';
export type { GitAuthor, CommitInfo } from './gitService.js';
export * as publishedContentCache from './publishedContentCache.js';
