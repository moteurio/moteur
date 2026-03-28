/* global console, process */
import { execFileSync } from 'child_process';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const root = process.cwd();
const changelogPath = path.join(root, 'CHANGELOG.md');

function git(args) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
}

function getPrevMoteurTag() {
    try {
        const out = git([
            'for-each-ref',
            '--sort=-creatordate',
            '--format=%(refname:short)',
            'refs/tags/moteur@*'
        ]);
        const tags = out
            .split('\n')
            .map(t => t.trim())
            .filter(Boolean);
        return tags[0] ?? null;
    } catch {
        return null;
    }
}

function commitBullets(prevTag) {
    const pretty = 'format:- %s (%h)';
    if (prevTag) {
        return git(['log', `${prevTag}..HEAD`, '--no-merges', `--pretty=${pretty}`]);
    }
    const lines = git(['log', '-50', '--no-merges', `--pretty=${pretty}`]);
    return (
        `First coordinated \`moteur@\` release tag; recent commits (no prior \`moteur@*\` tag):\n\n${lines}`
    );
}

const line = process.env.EXPECTED_MOTEUR_LINE?.trim();
if (!line) {
    console.error('prepend-release-changelog: EXPECTED_MOTEUR_LINE is required');
    process.exit(1);
}

let changelog = fs.readFileSync(changelogPath, 'utf8');
if (changelog.includes(`\n## ${line}\n`)) {
    console.error(
        `prepend-release-changelog: CHANGELOG.md already has section "## ${line}"; refusing duplicate`
    );
    process.exit(1);
}

const prevTag = getPrevMoteurTag();
let body = commitBullets(prevTag);
if (!body) {
    body = '- _(no commits in range)_';
}

const section = `## ${line}\n\n${body}\n`;

const insertAt = changelog.search(/\n## /);
if (insertAt === -1) {
    console.error('prepend-release-changelog: could not find first ## section in CHANGELOG.md');
    process.exit(1);
}

changelog = changelog.slice(0, insertAt) + `\n${section}` + changelog.slice(insertAt);
fs.writeFileSync(changelogPath, changelog, 'utf8');
console.error(
    `prepend-release-changelog: prepended "## ${line}"` +
        (prevTag ? ` (commits since ${prevTag})` : ' (bootstrap)')
);

const notesOut =
    process.env.RELEASE_NOTES_FILE?.trim() ||
    path.join(process.env.RUNNER_TEMP || tmpdir(), 'moteur-release-notes.md');
const notesBody = `Published \`@moteurio/*\` packages at **${line}**.\n\n${body}\n`;
fs.writeFileSync(notesOut, notesBody, 'utf8');
console.error(`prepend-release-changelog: wrote ${notesOut}`);
