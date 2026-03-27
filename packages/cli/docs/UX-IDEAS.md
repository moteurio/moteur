# CLI Studio — UX / Ink ideas

## Implemented

- **Toast notifications** — Transient messages at top of content panel (e.g. "✓ Entry deleted", "✗ Delete failed"). Auto-dismiss after 2s. Used after single/bulk delete.
- **KeyHint / KeyHints** — Micro-component for consistent key+label styling (amber key, dim label). Used by StatusBar; can be used inline on empty states or detail views.
- **Splash** — Intro screen: MOTEUR ASCII art, version, tagline. Shown for 1.5s on every startup (before login or main UI), then login screen or project picker.
- **LoadingSpinner** — Uses `ink-spinner` (type="dots") in theme amber with label; used for project list and entries.
- **Divider** — Simple horizontal line (dim) between content and status bar; optional character/length.

## Next (high value)

- **Terminal width (useStdout)** — `useStdout().stdout.columns` (or `ink-use-stdout-dimensions`). Narrow terminal → single-panel (sidebar hidden, content full width); wide → full layout.
- **Confirm overlay** — Replace inline delete confirm with a centred `<ConfirmDialog>` over a dimmed layout (amber border, "Delete 'About Us'? [Y/n]").
- **Clipboard (clipboardy)** — C on selected entry copies ID; C on token/URL copies to clipboard. Hint in status bar: "C copy".
- **ink-link** — Clickable links where supported (entry public URL, webhook endpoint). Degrades to plain text otherwise.
- **ink-spinner** — Add `ink-spinner`, use `type="aesthetic"` (or `dots`/`arc`/`bouncingBar`) in amber for all loading states.
- **ink-big-text** — Optional: block-letter "MOTEUR" on splash. Requires `ink-big-text` (cfonts).

## Optional

- **useStdin raw mode** — Confirm raw mode is on (e.g. via Ink's `useInput`) so single-key actions don't feel laggy.
- **Animated transition** — Simple "fade" between screens (e.g. one frame at dim then full) to soften instant swap.

---

## Final review — Ink components

| Component                                 | Status   | Notes                                                                                                                                                                                   |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ink-text-input**                        | In use   | Login (API URL, email, password); EntryEditor inline edit.                                                                                                                              |
| **ink-spinner**                           | Consider | Replace custom `LoadingSpinner` (dots) with `ink-spinner` (e.g. `type="dots"` or `"aesthetic"`) for a real spinner; keep amber via `color`.                                             |
| **ink-select-input**                      | Consider | EntryEditor `core/select` currently uses custom ↑/↓ + Enter. Could use `ink-select-input` for consistent UX; would need to map `choices` to `items` and handle focus with other fields. |
| **ink-link**                              | Consider | Detail view / webhooks: show URLs as links where terminal supports it. Low effort.                                                                                                      |
| **ink-gradient**                          | Skip     | Branding already clear with amber/teal; gradient adds dependency and may not render well everywhere.                                                                                    |
| **ink-big-text**                          | Optional | Splash: could replace ASCII with figlet-style block text; current ASCII is lightweight and recognizable.                                                                                |
| **ink-picture**                           | Skip     | Atelier is for content/metadata; image preview is a bigger feature.                                                                                                                     |
| **ink-tab**                               | Skip     | Navigation is sidebar + content, not tab bar.                                                                                                                                           |
| **ink-color-pipe**                        | Skip     | Theme already uses chalk/hex; no need for style strings.                                                                                                                                |
| **ink-multi-select**                      | Skip     | Bulk select is Space + list cursor; multi-select component would change interaction model.                                                                                              |
| **ink-divider**                           | Consider | Simple visual separator between sections (e.g. StatusLine vs content, or list vs hint).                                                                                                 |
| **ink-progress-bar**                      | Consider | Save progress in EntryEditor, or "Loading N/M" for pagination.                                                                                                                          |
| **ink-table**                             | Consider | Entries/list screens: table could show columns (label, id, updated); current row layout is fine for narrow terminals.                                                                   |
| **ink-ascii**                             | Consider | Splash/logo: figlet fonts for "MOTEUR" or "Atelier"; would replace current hand-made ASCII.                                                                                             |
| **ink-markdown**                          | Consider | Field info popup: render `def.notes` as markdown when present. Help panel could use it too.                                                                                             |
| **ink-quicksearch-input**                 | Consider | Filter mode ("/") could use quicksearch for type-to-filter list; current filter is plain TextInput, works.                                                                              |
| **ink-confirm-input**                     | Consider | Single/bulk delete and entry delete: replace "Press Y / Esc" with `<ConfirmInput>` for consistent Yes/No.                                                                               |
| **ink-syntax-highlight**                  | Consider | Detail view JSON, or raw entry data; low priority.                                                                                                                                      |
| **ink-form**                              | Skip     | Login and EntryEditor are custom (focus order, validation); form component would be a larger refactor.                                                                                  |
| **ink-task-list**                         | Skip     | Activity/submissions are lists, not task UX.                                                                                                                                            |
| **ink-titled-box**                        | Consider | Field info popup and confirm overlays: `<TitledBox title="Field info">` instead of manual Box + Text.                                                                                   |
| **ink-chart**                             | Skip     | No dashboard/stats in scope.                                                                                                                                                            |
| **ink-scroll-view** / **ink-scroll-list** | Consider | Long lists (entries, assets): scroll so only visible rows render; currently we render full list.                                                                                        |
| **ink-virtual-list**                      | Consider | Same as above: large lists (100+ entries) benefit from virtualizing.                                                                                                                    |
| **ink-stepper**                           | Skip     | No wizard flow.                                                                                                                                                                         |
| **ink-color-picker**                      | Skip     | Not needed.                                                                                                                                                                             |

### Quick wins (low effort, high value)

1. ~~**ink-spinner**~~ — Done: `LoadingSpinner` now uses `ink-spinner` (type="dots") with theme color.
2. **ink-titled-box** — Field info popup and (later) confirm dialog: use `<TitledBox title="Field info" borderStyle="single">` for consistent bordered title; reduces custom layout.
3. **ink-confirm-input** — Entry delete and list delete: use `<ConfirmInput onConfirm={...} onCancel={...} />` so Y/n is handled by the component; keeps Esc handling in useInput.
4. ~~**ink-divider**~~ — Done: custom `Divider` component (no dep) used above StatusLine.
5. **ink-link** — In detail view or webhook screen, wrap URLs in `<Link url={...}>` so supported terminals can open them.
