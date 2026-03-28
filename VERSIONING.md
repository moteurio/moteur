# Versioning (calendar release line)

Published `@moteurio/*` packages in this repo use a **calendar-based release line** instead of SemVer for the product epoch before (and optionally after) a “1.0” story. This follows the ideas behind [Calendar Versioning (CalVer)](https://calver.org/): the version should reflect **when** the line was cut and stay **easy to compare** when treated as a string.

## Canonical display form (tags, docs, comms)

Use a **four-part, zero-padded** string for humans and for **lexicographic sorting**:

`YYYY.MM.DD.micro`

- **YYYY** — Gregorian year (four digits).
- **MM** — Month `01`–`12`.
- **DD** — Day `01`–`31`.
- **micro** — Same-calendar-day index, zero-padded (e.g. `001`, `002`). First publish of the day is `001`.

Examples: `2026.03.27.001`, `2026.03.27.002`.

Git tags for per-package releases can mirror this, e.g. `core@2026.03.27.001`, or you may use the npm form below for tag text—**pick one convention per repo and document it in [RELEASING.md](RELEASING.md)**.

## `package.json` / npm (semver constraint)

The npm `version` field must be a valid [semver](https://semver.org/) string. Semver allows **three numeric release identifiers**; a fourth numeric segment such as `2026.03.27.001` is **not** valid semver, and identifiers like `03` for month are invalid if they have **leading zeros** in strict semver.

Therefore:

| Role                             | Format                                            | Example                      |
| -------------------------------- | ------------------------------------------------- | ---------------------------- |
| **npm `version`** (primary)      | `YYYY.M.D` with **no** leading zeros on month/day | `2026.3.27`                  |
| **Second+ publish same UTC day** | Prerelease segment (still semver)                 | `2026.3.27-2`, `2026.3.27-3` |

Treat the numeric prerelease only as a **build index for that calendar day**, not as “beta quality,” unless you explicitly decide otherwise in release notes.

**UTC vs local:** Define whether the date in the version is **UTC** or **organizer-local** and stick to it (CI should use the same rule). Recommended for distributed teams: **UTC date at publish time**.

**Which clock:** Prefer the **release pipeline or tag time** (not arbitrary commit timestamps) so the version matches what operators see in CI logs.

## Lockstep line in this monorepo

All publishable `@moteurio/*` packages under `packages/` share one **release line** value (same `version` and same `^<line>` on internal dependencies when not `workspace:*`).

The expected line is enforced by `scripts/validate-release-versions.mjs`. Override for a bump in CI or locally:

`EXPECTED_MOTEUR_LINE=2026.3.27-2 node scripts/validate-release-versions.mjs`

## Downstream repos

Hosts and plugins that depend on published `@moteurio/*` packages should pin the same line in `package.json` (e.g. `^2026.3.27`) and regenerate lockfiles after a publish—see [RELEASING.md](RELEASING.md).

## Compact numeric form (optional)

A single integer such as `260327001` is only recommended if an external system **requires** one token. If you use it, specify encoding (e.g. `YYMMDD` + 3-digit micro) in your integration docs; the npm packages in this repo still use semver as above.
