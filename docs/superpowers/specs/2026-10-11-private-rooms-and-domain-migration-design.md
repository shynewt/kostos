# Private rooms and domain migration

Date: 2026-10-11. Branch: `feat/domain-migration`.

## Goal

Only a client that holds a group's secret can reach that group's room on the sync server, and the 4 existing groups move to the new domain with their data intact. The new domain is kostos.app if it clears redemption, otherwise kostos.fi. Everything below says `NEW_DOMAIN`.

## Problem

`/sync/<roomId>` accepts any WebSocket, replays the full history and takes writes. The room ID is a short `PRT-XXXX-XXXX` label that also shows up in the Cloudflare dashboard. Payloads are AES-GCM encrypted client-side, so content stays private, but anyone who knows a room ID can download ciphertext or push junk that breaks sync for the group.

## Decisions

- Fresh keys for every group. Existing groups are recreated on the new domain through export and import. No server-side data migration.
- 128-bit secret, 22 base64url characters.
- Room ID derived from the secret, plus a server-side auth proof (trust on first use).
- Old and new domains run side by side as separate Workers until everyone has moved.

## Token and derivation

The token is the secret alone. Share link: `https://NEW_DOMAIN/join#<secret>`.

Four values come out of HKDF-SHA-256 over the secret, each with its own `info` string:

| Value | Size | Used for | Leaves the device |
| --- | --- | --- | --- |
| encryption key | 128-bit AES-GCM key | encrypting payloads | no |
| room ID | 32 bytes, 64 lowercase hex | server routing | yes, in the URL path |
| auth proof | 32 bytes, base64url | proving the secret is held | yes, in `Sec-WebSocket-Protocol` |
| label | `PRT-XXXX-XXXX` from the existing alphabet | UI display and local project key | no |

The label is not a credential. The UI never presents it as a key.

## Server

Worker (`worker/index.ts`):
- Accept `/sync/<64 lowercase hex>` only; anything else gets 400.
- Require a `Sec-WebSocket-Protocol` value; missing gets 401.
- Route with `idFromName(roomId)` as today.

Durable Object (`src/lib/server/sync-do.ts`):
- Inside the existing `serialized()` block, read `sha256(proof)` from `sync_meta`. If none is stored, store it (first claim). Otherwise compare in constant time and answer 401 before accepting the socket on mismatch.
- Echo the accepted subprotocol on the `101` response, since browsers drop the socket without it.
- Replay, `complete` and barrier logic are unchanged.

The new Worker has its own Durable Object namespace, so no legacy rows exist and the schema starts clean.

Node relays (`scripts/relay.js`, `serve.js`, `sync-server.js`, used for self-hosting, dev and e2e):
- Same rules, shared through `src/lib/sync/room-access.js`: strict 64-hex room ID, proof required in `Sec-WebSocket-Protocol`.
- `relay.js` stores `sha256(proof)` in `<room hash>.auth` next to the room's log on the first connection and closes any socket that presents a different proof with code 1008.
- `serve.js` drops upgrades with a malformed room ID or no proof; `sync-server.js` closes such sockets with 1008.

## Client

- `src/lib/token.ts`: `generateSecret` makes 16 bytes. `parseToken` accepts the share link or a bare secret and returns the secret only. Room ID generation is removed.
- `src/lib/sync/crypto.ts`: export derivations for key, room ID, proof and label.
- `src/lib/sync/provider.ts`: connect to `/sync/<room ID>` and send the proof as the WebSocket subprotocol.
- Local project key stays the label, so `/p/${roomId}` routes and storage keep their shape. 40 bits is enough to avoid collisions between a user's own groups.
- Call sites that stop passing a separate room ID: `routes/new`, `routes/import`, `routes/restore`, `routes/join`, `routes/scan`, `routes/+page.svelte`, `ProjectAppBar.svelte` (share URL).
- Join box: accepts the full link or the 22-character key. Placeholder and error copy say "invite link or group key"; the `PRT-XXXX-XXXX` placeholder is removed.
- `/join` reads the secret from the fragment only; the `?room=` parameter is gone.

## Migration

1. Cut a `legacy` branch from current `main`. It keeps the old protocol and gets one change: a banner telling users to move to `NEW_DOMAIN`, with the steps below. It deploys to the existing Worker on `kostos.shynewt.com`.
2. Deploy this branch as a second Worker on `NEW_DOMAIN`.
3. Each owner exports their groups from the old app (existing project archive), imports on `NEW_DOMAIN` (creates a fresh secret) and shares the new link.
4. Once everyone confirms, replace the legacy Worker with a 301 redirect to `NEW_DOMAIN` and delete the old rooms.

Before step 3, devices in each group should sync so the export has the latest data.

## SEO and sitemaps

Update canonical tags and `web/src/pages/sitemaps/` to `NEW_DOMAIN` in the same change. The old domain 301s after step 4.

## Testing

- Token and crypto unit tests updated for the new format and derivations, including that each derived value differs from the others.
- Worker: malformed room ID gets 400, missing proof gets 401.
- Durable Object: first connection claims the room, a wrong proof gets 401, the right proof connects, two simultaneous first connections resolve to one winner.
- Provider: connects with the subprotocol and syncs a document between two clients.
- Join flow: full link and bare key both parse; old `ROOM.SECRET` and `?room=` forms are rejected with a clear message.

## Out of scope

- Rate limits or storage caps against someone claiming unused room IDs. Worth revisiting before the launch posts.
- Landing page rework and SEO copy, which get their own design once the domain is settled.
