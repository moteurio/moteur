# @moteurio/presence

Server-side Socket.IO layer for Studio: who is online, optional **exclusive** field locks, cursors, and **ephemeral per-screen state** (last-write-wins) merged via `screen:patch`.

- **Protocol and events:** [`../docs/Presence API.md`](../docs/Presence%20API.md)
- **HTTP:** `createPresenceRouter` (debug + clear screen state), `attachPresenceServer` for the WebSocket server

The API package loads environment variables and `@moteurio/core`; this library does not call `dotenv` on import.
