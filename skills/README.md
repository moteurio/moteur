# Skills

Instructions for AI agents working with Moteur. [moteur](moteur/SKILL.md) covers modeling content, import bundles, reading content and building a site.

To use it with Claude Code, copy (or link) `skills/moteur` into a project's `.claude/skills/`, or into `~/.claude/skills/` for every project.

`references/fields.md` is written from the code: after changing a field type, run `UPDATE_SKILL=1 pnpm --filter @moteurio/core exec vitest run tests/agentGuide.test.ts`. The tests fail when it is out of date, and check every example against Moteur.
