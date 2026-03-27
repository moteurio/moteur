# Moteur WebSocket Presence API

Socket.IO events for real-time collaboration in Studio: who is online, optional **exclusive (no conflict)** field locks, viewport cursor, and **ephemeral screen state** (form fields + UI keys) via last-write-wins (LWW).

For a **REST** snapshot of who is “online” in a project (derived from recent presence heartbeats; window default **90s**, overridable with **`ONLINE_PRESENCE_MAX_IDLE_MS`** on the API host), see `GET /projects/:projectId/users` and the `online` flag in [REST API — Project members](REST%20API.md#project-members).

## Transport

- **Socket.IO** (WebSocket).
- One connection per `projectId` in Studio; each navigation re-emits `join`.

## Collaboration modes

Each socket sends a **preference** on `join` (`collaborationMode`). The **effective room mode** is:

- **`exclusive`** only if **every** connected socket in the project room has `collaborationMode: 'exclusive'`.
- Otherwise **`shared`** (default when omitted).

In **shared** mode, field values sync via `screen:patch` without locks. In **exclusive** mode, a user must hold the field lock (via `presence:update` `fieldPath`) before `screen:patch` updates that field; others get `screen:patch:denied` for keys they do not hold.

When the room switches from **exclusive** to **shared**, the server clears all field locks and emits `locks:sync` with an empty map.

---

## `join`

**Client → Server**

```ts
{
  projectId: string;
  screenId?: string;
  collaborationMode?: 'shared' | 'exclusive';
}
```

**Server**

- Joins room `projectId`, registers presence, applies `collaborationMode` (default `shared` when omitted).
- Emits to this socket: `screen:sync` (if the screen has ephemeral data), `presence:sync`, `locks:sync`, then `presence:roomMode` (and may broadcast `presence:roomMode` / clear locks if the effective mode changed).
- First join also broadcasts `presence:change` to others.

Idempotent re-join (same socket, same project): refreshes snapshots only; see server implementation for duplicate join noise.

---

## `leave`

**Client → Server**

```ts
{
    projectId: string;
}
```

Releases this socket’s locks, removes presence, notifies room, may broadcast `presence:roomMode` if effective mode changed.

---

## `presence:update`

**Client → Server**

Typical optional fields:

```ts
{
  screenId?: string;
  entryId?: string;
  fieldPath?: string | null; // empty clears focused field; in exclusive mode acquires/releases locks
  overlayId?: string | null;
  collaborationMode?: 'shared' | 'exclusive';
  typing?: boolean;
  textPreview?: string;
  cursor?: { x: number; y: number }; // 0–100
  pointerPulse?: number;
}
```

**Locks** run only when the **effective room mode** is `exclusive`. Failed acquire emits `lock:denied` to the requester.

On blur / field switch / disconnect, peers may receive `screen:change` with the latest serialized value for released fields (LWW store).

---

## `screen:patch`

**Client → Server**

```ts
{
  screenId: string;
  fields?: Record<string, string>; // namespaced field keys → serialized values
  ui?: Record<string, string>;      // arbitrary UI keys (tabs, overlay hints, etc.)
}
```

Validated: `fields` and `ui` keys must match `^[\w:./-]+$` (colon allowed for namespaced UI keys such as `layoutTab:fieldName`), plus max keys and max value size. Rate-limited per socket.

**Server**

- Merges with LWW using server receive time.
- Rejects patches when `payload.screenId` does not match this socket's current presence `screenId` (set by `join` / `presence:update`).
- In **exclusive** mode, drops `fields` entries for which the sender does not hold the lock; emits `screen:patch:denied` with `fieldPaths` when any were dropped.
- In **exclusive** mode, `ui` remains collaborative (not lock-gated); only `fields` are lock-filtered.
- Broadcasts to other room members:

```ts
// screen:change
{
    screenId: string;
    fields: Record<string, string>;
    ui: Record<string, string>;
    originUserId: string;
}
```

---

## `presence:roomMode`

**Server → Client**

```ts
{
    mode: 'shared' | 'exclusive';
}
```

Sent when joining and whenever the **effective** mode changes (someone joined, left, or changed preference).

---

## `screen:sync`

**Server → Client** (on join / re-join when the screen has state)

```ts
{
    screenId: string;
    fields: Record<string, string>;
    ui: Record<string, string>;
}
```

---

## `presence:sync`

**Server → Client**

```ts
{ users: Presence[] }
```

---

## `locks:sync` / `locks:update`

Same as before: full map `fieldPath → userId`, and incremental `{ type: 'lock' | 'unlock', fieldPath, userId }`. Meaningful primarily in **exclusive** mode.

---

## `lock:denied`

**Server → requester**

```ts
{ fieldPath: string; heldByUserId?: string }
```

---

## `screen:patch:denied`

**Server → requester** (exclusive mode, patch contained locked keys)

```ts
{ fieldPaths: string[] }
```

---

## `presence:change`

**Server → others**

```ts
{
    userId: string;
    changes: Partial<PresenceUpdate> | null;
}
```

`changes: null` means the user left. May include `collaborationMode` when a peer changes preference.

---

## `disconnect`

System: same cleanup as leave (locks, `screen:change` for held fields, `presence:change`, possible `presence:roomMode`).

---

## `Presence` shape (TypeScript)

```ts
{
  userId: string;
  name: string;
  avatarUrl?: string;
  projectId: string;
  screenId?: string;
  collaborationMode?: 'shared' | 'exclusive';
  entryId?: string;
  fieldPath?: string;
  overlayId?: string;
  typing?: boolean;
  textPreview?: string;
  cursor?: { x: number; y: number };
  pointerPulse?: number;
  updatedAt: number;
}
```

---

## Studio notes

- **Live / No conflict** toggle in the header persists in `sessionStorage` and is sent on `join` and on change via `presence:update`.
- Entry editor uses `screen:patch` for field sync; in **shared** mode it skips applying remote updates for the logical field that is locally focused (reduces caret fights).
- **Ephemeral UI** (`screen:patch` `ui`, LWW per key): Studio field components use namespaced keys on the **same `screenId`** as the entry route (see admin `useEntryScreenPresenceUi`). Examples:
    - `layoutTab:{fieldName}`, `blockListTab:{fieldName}` — `visual` / `json`
    - `htmlEditorView:{fieldName}` — `visual` / `raw`
    - `blockPicker:{fieldName}` — JSON `{"m":"a"}` (add) or `{"m":"c","i":n}` (change type at index); empty string when closed
    - `imageAssetPicker:{fieldName}`, `imageGenPanel:{fieldName}` — `'1'` / `''`
    - `assetPicker:{fieldName}`, `assetRemoveModal:{fieldName}`, `assetListPicker:{fieldName}` — `'1'` / `''`
    - `tagsAddInput:{fieldName}`, `tagsEditing:{fieldName}` — add-input open; tag index string or `''`
- `useStudioPresenceOverlay` also mirrors `overlayId` into `ui` key `studioOverlay` as ephemeral telemetry (currently no built-in subscriber renders peer overlays from this key).

---

## HTTP (Studio / operators)

| Method   | Path                                             | Purpose                                                            |
| -------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `DELETE` | `/projects/:projectId/presence/screen/:screenId` | Clear ephemeral LWW state (fields + `ui`) for that `screenId`.     |
| `GET`    | `/projects/:projectId/presence/debug`            | Snapshot of connected presence rows and per-screen ephemeral maps. |

---

## Debug

Prefix **`[presence:debug]`**. Set **`PRESENCE_DEBUG=1`** for verbose `screen:patch` logging.
