# Private rooms and domain migration (v3)

Date: 2026-10-11, revised 2026-10-16. Branch: `feat/domain-migration`.

## Goal

Only a client that holds a group's secret can reach that group's room on the sync server. Hosted groups move to the new domain with their data intact, and self-hosters get a short upgrade path. The new domain is `kostos.app` if it frees up, otherwise `kostos.fi`. Everything below says `NEW_DOMAIN`.

This is a breaking protocol change, so the release is **3.0.0**.

## Problem

`/sync/<roomId>` accepts any WebSocket, replays the full history and takes writes. The room ID is a short `PRT-XXXX-XXXX` label that also shows up in the Cloudflare dashboard. Payloads are AES-GCM encrypted client-side, so content stays private, but anyone who knows a room ID can download ciphertext or push junk that breaks sync for the group.

## Decisions

- Fresh keys for every group. Existing groups are recreated through export and restore. No server-side data migration.
- 128-bit secret, 22 base64url characters. The invite is the secret alone.
- Four values derived from the secret. The server routes by one and checks another (trust on first use).
- No short label. It only existed to be glanced at, and an invite link does not need one.
- Hosted: old and new domains run side by side as separate Workers. The old site is never turned into a redirect for the app; it keeps working for export until a published retirement date.
- Self-hosters upgrade in place and move each group with the existing export and restore.

## Terms

| Name | What it is |
| --- | --- |
| secret | 16 random bytes, 22 base64url characters. The only thing a group shares. |
| local ID | Derived. Identifies the group on the device: `/p/<local ID>` routes, `localStorage`, IndexedDB name. Called `roomId` in existing code. |
| relay room ID | Derived. What the sync server routes by. Called `relayRoomId` in code. |
| proof | Derived. Shows the server the client holds the secret. |

## Token and derivation

Share link: `https://NEW_DOMAIN/join#<secret>`. The secret never goes in a query string or path.

HKDF-SHA-256, empty salt, `info` is `kostos/<purpose>/v1`:

| Purpose | Size | Encoding | Leaves the device |
| --- | --- | --- | --- |
| `encryption` | 128 bits | AES-GCM key | no |
| `local` | 128 bits | 32 lowercase hex | no (appears only in app URLs on the host serving the app) |
| `room` | 256 bits | 64 lowercase hex | yes, in `/sync/<relay room ID>` |
| `auth` | 256 bits | 43 base64url | yes, in `Sec-WebSocket-Protocol` as `kostos1.<proof>` |

Knowing the relay room ID and proof gives no way to the key: the derivations are independent. The AES key drops from 256 to 128 bits, which matches the secret's entropy. A pinned test locks every info string, because changing one orphans every group.

## Server

Worker (`worker/index.ts`):
- Accept `/sync/<64 lowercase hex>` only; anything else gets 400.
- Require a `Sec-WebSocket-Protocol` proof; missing gets 401.
- Route with `idFromName(relayRoomId)`.

Durable Object (`src/lib/server/sync-do.ts`):
- A `room_auth` table holds `sha256(proof)`. The first connection claims the room inside the existing `serialized()` block (primary key makes a double claim impossible). Later connections are compared in constant time.
- A wrong proof still completes the upgrade with the echoed subprotocol, receives `{"type":"denied"}` and is closed with 1008. A failed HTTP upgrade is invisible to browser JavaScript, and without this signal every device would retry forever and look merely offline.
- Per-room storage cap: `MAX_ROOM_BYTES` (32 MiB). Past it, writes get the existing `storage` error instead of an acknowledgement.
- Replay, `complete` and barrier logic are unchanged. The new Worker has its own Durable Object namespace, so the schema starts clean.

Node relays (`scripts/relay.js`, `serve.js`, `sync-server.js`; self-hosting, dev, e2e):
- Same rules from the shared `src/lib/sync/room-access.js`: strict 64-hex ID, proof required, same `denied` signal, same storage cap.
- The claim lives in `<room hash>.auth` next to the room's log. It is written to a temp file and linked into place, so a crash never leaves a half-written claim. A file that is not a valid hash is a hard error, never "unclaimed".
- `serve.js` handles SIGTERM (done in v2.10.1).

Abuse beyond one room is handled at the edge, not in code: a Cloudflare rate-limit rule on `/sync/*` for the hosted Worker, and the reverse proxy for self-hosters. Both are in the rollout checklist and the self-hosting guide.

## Client

- `src/lib/token.ts`: `generateSecret` makes 16 bytes. `parseToken` accepts the share link or a bare secret and returns the secret. Room ID generation and the `PRT` alphabet are removed.
- `src/lib/sync/crypto.ts`: one `expand` helper and the derivations (key, local ID, relay room ID plus proof).
- `src/lib/sync/provider.ts`: connects to `/sync/<relay room ID>` with the proof as subprotocol. On `denied` it stops retrying and reports a terminal state the sync status UI words as "This group belongs to a different key. Ask for a fresh invite link."
- Local project key is the local ID, so storage and routes keep their shape. The three places that showed the label (new group, invite card, join error) drop it.
- Join box: accepts the full link or the 22-character key. Copy says "invite link or group key". `/join` reads the secret from the fragment only.
- Old-format input (`?room=`, `ROOM.SECRET`, a 43-character key) is rejected with a message that says the invite is from the old site.
- Call sites that stop passing a separate room ID: `routes/new`, `import`, `restore`, `join`, `scan`, `+page.svelte`, `ProjectAppBar.svelte`. Restore logic shared by restore, import and demo is extracted once instead of copied.

## Code quality bar

The goal is a codebase an outsider reads and finds cared for.

- One concern per module: `token.ts` parses invites, `crypto.ts` derives and encrypts, `room-access.js` holds the server rules, `legacy.ts` recognises old groups. No second copy of any pattern or constant.
- Plain JS only where a Node script must import it, and then typed with JSDoc.
- `type` not `interface`, `T[]` not `Array<T>`, no `any`, no dead code left behind (label generation, old token patterns and the `?room=` handling are deleted, not commented out).
- Named constants for every limit and prefix. Comments say why, never what.
- Tests describe behaviour, not implementation, and each new rule has one that fails first.
- The last task runs `simplify` and `code-review` over the whole branch diff and fixes what they find before merging.

## Upgrading a self-hosted server

The README gets a short "Upgrading to v3" section. Steps for the person who runs the server:

1. Ask members to open the app online once, so their devices hold the latest data.
2. Pull the new image and restart. Same volume, same variables, same port, nothing else changes.
3. Open each group on one device. v3 recognises the old format, does not try to sync it, and shows a banner with two buttons: export a backup, and restore it as a new group.
4. Share the new invite link of each restored group. Others join that link. Only one person per group does steps 3 and 4.
5. When everyone has moved, delete the old `*.jsonl` files from the data volume.

What makes this work: a v3 app still opens an old group offline from the data on the device, and Export and Restore already exist. The only new UI is the banner. The old server files are never read again. A restore keeps members, categories, payment methods, trips and expenses. It does not keep the activity log or conflict history, and the device's "this is me" choice has to be picked again. The guide says so.

## Hosted migration

1. Cut a `legacy` branch from `main` at the last v2 release. It keeps the old protocol and gets: a persistent banner telling users to move to `NEW_DOMAIN`, an Export button that warns unless the device is fully synced (`phase` is synced and no pending changes), and the "one person per group" wording. It deploys to the existing Worker through its own workflow, pinned to that branch.
2. Deploy this branch as a second Worker on `NEW_DOMAIN`, only after the domain is registered and its zone is on Cloudflare.
3. One person per group exports on the old site and restores on `NEW_DOMAIN`, then shares the new link. The banner says not to export yourself. The mover can paste the new link into the old group's description, which reaches every member through normal sync.
4. Installed apps keep the old build until they accept the update prompt. The legacy build marks the update as needed to see an important notice. Dormant users are reached through the owners of the 4 groups directly.
5. On a published retirement date (at least three months out), take the old Worker down. Until then it keeps serving and exporting. The app is never redirected, because installed apps and WebSocket upgrades do not follow redirects and an unexported group would become unreachable. Only the landing page and `/join` may redirect after the date.

Installed PWAs are tied to the old origin, so people reinstall from `NEW_DOMAIN`. The banner and the owner message say so, with a note for iOS home screen users.

## Domain

`NEW_DOMAIN` appears in: `wrangler.toml`, `.github/workflows/release.yml` (environment URL), the README, and the legacy banner. Share links use `location.origin`, so the app itself needs no constant. The rollout checklist ends with `rg "kostos\.(app|fi)"` so no stale copy survives the final choice. Nothing deploys until the domain is final, because groups moved to the wrong one cannot cheaply move again.

SEO is not part of this change. The repo has no sitemap or canonical tags (`static/robots.txt` only); the landing page and its SEO get their own design once the domain is settled.

## Rollout checklist

- Domain registered, zone in the same Cloudflare account, `CLOUDFLARE_API_TOKEN` scope includes it.
- `workers_dev = false` on the new Worker so there is no second public origin.
- Cloudflare WAF rate-limit rule on `/sync/*`.
- Workers Logs checked so the `Sec-WebSocket-Protocol` header (the proof) is not retained. If it cannot be excluded, document it.
- `wrangler deploy --dry-run` for both Workers.
- Separate `release-legacy.yml` and its own environment, pinned to the `legacy` branch.
- A short message to each of the 4 owners: what to do, a freeze date, and the retirement date.
- Rollback: `wrangler rollback` for code problems. Old rooms stay until the retirement date.
- Final `rg` for the old domain and for `PRT-`.

## Testing

- Token and crypto unit tests for the new format, pinned vectors for every derivation, and a check that each derived value differs from the others.
- Worker: malformed ID gets 400, missing proof gets 401.
- Durable Object: first connection claims, wrong proof gets `denied` and close 1008, right proof connects, two simultaneous first connections give one winner, writes past the cap are refused.
- Node relay: the same cases against a temp directory, plus a crash-torn `.auth` file being treated as an error.
- Provider: connects with the subprotocol, stops retrying after `denied`, and syncs a document between two clients.
- Join flow: full link and bare key parse; the old forms are rejected with the old-site message.
- Legacy detection: a stored group with an old-format secret is recognised, gets no provider, and still exports from local data.
- Browser e2e for join, create, invite link and the legacy banner.

## Out of scope

- Per-IP rate limiting in code (edge and reverse proxy handle it).
- Landing page rework and SEO copy.
- A one-tap in-app upgrade. The banner with Export and Restore covers it, and a dedicated flow can come later if people struggle.
