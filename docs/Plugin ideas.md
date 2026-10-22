# Plugin & product ideas (backlog)

Informal backlog for **host API plugins** (`@moteurio/plugin-*`) and optional **Studio companions** (`studio-plugin-*` in **moteur-plugins-extra**). Taxonomy: [Plugin architecture.md](Plugin%20architecture.md).

Not scheduled — use this to prioritize RFCs and packages.

---

## Parked (liked, later)

### Interactive flow / dialogue editor

Authoring **UX graphs** (dialogue, presentation modes, branching) as **content**, with a Studio graph editor and a **frontend runtime** (not server-side DAG execution). Likely: dedicated model or structure + companion + optional `@moteurio/flow-runtime` in **moteur**.

---

## Shortlist (current interest)

### 1. A/B experiments (content-level)

**Goal:** Authors define control + variant entries (or block variants) and a traffic split; frontends fetch assignment + render; optional impression/conversion POST.

| Piece | Notes |
| ----- | ----- |
| **API plugin** | `scope: project`. Models or block type `play/experiment`; validation (weights sum to 100, variant refs exist). Routes: `GET …/play/experiments/:id/assign` (cookie/session sticky), `POST …/play/experiments/:id/events`. |
| **Studio** | Companion: pick variants, preview assignment, read-only stats table. |
| **Runtime** | Site SDK: `getVariant(experimentId)` — small helper in **client** or plugin doc. |
| **Repo** | **moteur-plugins** (OSS-friendly core); stats storage plugin-owned or core events. |

**Not:** Full Optimizely; no client-side script injection wars.

---

### 2. Declarative personalization rules

**Goal:** “When segment X, prefer block/entry Y” as **data** — evaluated on server (resolve) or client (bundle rules in JSON).

| Piece | Notes |
| ----- | ----- |
| **API plugin** | Field type or structure `play/personalization-rule` (conditions: locale, query param, cookie name, relation, entry field). Optional `POST …/play/personalize/resolve` with context body → `{ blocks \| entryIds }`. |
| **Studio** | Rule list + condition builder (no code); test panel with fake context. |
| **Runtime** | Headless: one resolve call per page or ship rules in public JSON for edge. |
| **Repo** | **moteur-plugins**. Pairs with A/B (#1) but keep separate plugin ids. |

---

### 3. Cookie consent & CMP bridge

**Goal:** Content-native consent: categories, policy text per locale, script/vendor labels — frontends gate tags; optional sync with IAB TCF later.

| Piece | Notes |
| ----- | ----- |
| **API plugin** | Project-level consent config + version; `GET …/play/consent.json` (categories, legal text refs). Block `play/consent-banner` for copy/layout hints only. |
| **Studio** | Category editor, vendor list, “policy version” bump workflow. |
| **Runtime** | Frontend reads JSON + sets consent cookie; **does not** replace a full CMP unless extended. |
| **Repo** | **moteur-plugins** (many sites need it). |

**Integrates:** Declarative rules (#2) can key off `consent.analytics === true`.

---

### 4. Mailchimp integration

**Goal:** Subscribe forms, audience sync, campaign tags — tied to Moteur forms/entries.

| Piece | Notes |
| ----- | ----- |
| **API plugin** | `scope: project`. Store encrypted API key per project (or host env). Routes: subscribe webhook from public form, `POST …/integrations/mailchimp/sync` (operator). Map entry fields → merge fields. |
| **Studio** | Audience picker, field mapping UI, test subscribe. |
| **Repo** | **moteur-plugins-extra** (credentials, vendor API) or OSS plugin with env-only keys. |

---

### 5. HubSpot integration

**Goal:** Forms → contacts/deals; optional content analytics handoff; CRM field mapping.

| Piece | Notes |
| ----- | ----- |
| **API plugin** | Same pattern as Mailchimp: OAuth or private app token per project, form submission handler, sync jobs. |
| **Studio** | Pipeline/object picker, mapping, dry-run. |
| **Repo** | **moteur-plugins-extra** (likely one `plugin-crm-hubspot` or shared `plugin-integrations` with adapters). |

**Shared platform idea:** One **`plugin-integrations`** core with Mailchimp + HubSpot as submodules reduces duplicate “form → CRM” plumbing.

---

### 6. Feed composer

**Goal:** Multiple syndication outputs from collections: JSON Feed, extended RSS, newsletter digest model, Apple News–style JSON (subset).

| Piece | Notes |
| ----- | ----- |
| **API plugin** | `scope: project`. Feed definitions (query, locale, limit, template). Routes: `GET …/play/feeds/:slug.json`, `…/feeds/:slug.rss`. |
| **Studio** | Feed builder: source collection/filter, field mapping, preview URL. |
| **Runtime** | Pure HTTP — great for CDN cache. |
| **Repo** | **moteur-plugins** (high reuse, no secrets). |

**Synergy:** Static path hints (future) + feed composer = strong **SSG/headless** story.

---

## Suggested build order (if pursuing shortlist)

1. **Feed composer** — few secrets, clear HTTP value, low Studio risk.  
2. **Consent manager** — broad demand; unblocks marketing tags.  
3. **Declarative rules** — reuse consent + entry data.  
4. **A/B experiments** — needs assignment + event storage.  
5. **Mailchimp / HubSpot** — shared integration layer first, then vendor adapters.

---

## See also

- [Plugins.md](Plugins.md) · [Plugin architecture.md](Plugin%20architecture.md)
- CLI UX backlog: [`packages/cli/docs/UX-IDEAS.md`](../packages/cli/docs/UX-IDEAS.md)
