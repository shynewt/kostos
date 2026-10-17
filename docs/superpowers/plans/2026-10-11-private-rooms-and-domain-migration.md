# Private rooms and domain migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only a client that holds a group's secret can reach that group's room on the sync server. The secret is the whole invite (22 characters, shared as `https://APP_DOMAIN/join#<secret>`). Hosted groups move to the new domain with their data intact, self-hosters upgrade in place, and groups made before v3 stay readable and exportable until they are moved. Released as 3.0.0 because the protocol breaks.

**Architecture:** The secret (16 random bytes, 22 base64url characters) is expanded with HKDF-SHA-256 into four independent values: the AES-128-GCM key and a 32-hex local ID (both stay on the device), and a 64-hex relay room ID plus a 43-character proof (both go to the server). The server routes by relay room ID; the Durable Object (or Node relay) stores `sha256(proof)` when the first client connects and treats every other proof as foreign: it completes the upgrade, sends `{"type":"denied"}` and closes with 1008, because a failed HTTP upgrade is invisible to browser JavaScript. One shared plain-JS module, `src/lib/sync/room-access.js`, holds the rules so the Worker, the Node relays and the client agree. A room refuses writes past `MAX_ROOM_BYTES` (32 MiB). A stored group with an old 43-character secret never opens a socket; a banner offers export and restore as a new group.

**Tech Stack:** SvelteKit 2 + Svelte 5, TypeScript, Yjs, Cloudflare Workers + Durable Objects (SQLite), Node `ws` relays, Vitest, Miniflare, Playwright (e2e), Docker.

**Spec:** `docs/superpowers/specs/2026-10-11-private-rooms-and-domain-migration-design.md`

## Task map

| # | Task | Branch | Leaves compiling and `npm test` green |
| --- | --- | --- | --- |
| 1 | Shared room access rules | `feat/domain-migration` | New files only. |
| 2 | Derivations from the secret | same | `crypto.ts` gains exports; every caller of `deriveKey` is untouched. |
| 3 | Provider connects with the derived room and proof | same | App still creates old-style groups; they sync because derivation accepts any secret length. |
| 4 | One shared way to create a group | same | Pages call `createGroup`; IDs are still the old generated ones. |
| 5 | Invites, local IDs and the join flow | same | The new format is complete on the client. Old-format stored groups are not yet guarded (Task 7). |
| 6 | Provider handles `denied` | same | Terminal status and wording. |
| 7 | Legacy groups | same | Old-format groups never sync, banner and home marker. |
| 8 | Worker and Durable Object | same | Server side of the cloud target. Node relays unchanged. |
| 9 | Node relays and the Docker image | same | Server side of the self-host target. |
| 10 | e2e, deploy config, docs | same | Everything on this branch; e2e runs. |
| 11 | Hosted migration | this branch plus `legacy` | Docs and a workflow here; banner code on `legacy`. |
| 12 | Quality pass | same | Final gate before merge. |

Tasks 1 to 10 and 12 land on `feat/domain-migration`; Task 11 has a part on that branch and a part on `legacy`. Tasks 4 to 7 edit the same pages, so do them in order. Nothing from Tasks 3 to 7 is releasable alone (a v3 client against a v2 server cannot sync), so merge and deploy only after Task 10.

## Global Constraints

- Code style follows the surrounding files: tabs, single quotes, `type` not `interface`, `T[]` not `Array<T>`, no `any`.
- No em-dashes and no double dashes in code comments, docs or copy. Command flags such as `--dry-run` are the only exception.
- Comments only where the code can't explain itself; short, why not what.
- Never edit generated code. Commits: Conventional Commits, one short line, no `Co-authored-by`.
- Naming. In the app, `roomId` keeps meaning the local ID: the `/p/<roomId>` route, `ProjectRef.roomId`, `localStorage` keys and the IndexedDB name `kostos:<roomId>`. The value the server sees is always called `relayRoomId`. The word "token" survives only in the file name `token.ts` and in code identifiers; user-facing copy says "invite link" for the URL and "group key" for the 22 characters.
- Secret: exactly 22 base64url characters (`^[A-Za-z0-9_-]{22}$`), 16 random bytes. Groups made before v3 have 43-character secrets (32 bytes) and are "legacy".
- Derivations: HKDF-SHA-256, empty salt, info `kostos/<purpose>/v1`.

  | Purpose | Bits | Encoding | Leaves the device |
  | --- | --- | --- | --- |
  | `encryption` | 128 | AES-GCM key | no |
  | `local` | 128 | 32 lowercase hex | no |
  | `room` | 256 | 64 lowercase hex, the path `/sync/<relayRoomId>` | yes |
  | `auth` | 256 | 43 base64url, subprotocol `kostos1.<proof>` | yes |

  Changing any purpose or size orphans every group, so a pinned test guards them.
- Share link: `https://<host>/join#<secret>`. `?room=`, `ROOM.SECRET` and 43-character keys are rejected with a message that says the invite is from the old site.
- Limits are named constants: `MAX_MESSAGE_BYTES` (1 MiB, existing) and `MAX_ROOM_BYTES` (32 MiB), both in `src/lib/sync/relay-protocol.js`.
- The new domain is the literal `APP_DOMAIN` in `wrangler.toml`, `.github/workflows/release.yml`, the README and the legacy banner until it is final. Tests never hardcode a real domain; they use `kostos.example`.
- Demo mode (`roomId === DEMO_ROOM_ID`, value `'DEMO'`) must keep working.
- SEO and the landing page rework are out of scope (spec). Landing copy edits in Task 5 keep titles and structure unchanged.
- Test commands: `npx vitest run <path>` for one file, `npm test` for all, `npm run check` for types, `npm run build && npm run test:e2e` for the browser scenarios.

### Code quality bar

- One concern per module: `token.ts` parses invites, `crypto.ts` derives and encrypts, `room-access.js` holds the server rules, `legacy.ts` recognises old groups. No second copy of any pattern or constant.
- Plain JS only where a Node script must import it, and then typed with JSDoc.
- `type` not `interface`, `T[]` not `Array<T>`, no `any`, no dead code left behind. Label generation, old token patterns and the `?room=` handling are deleted, not commented out.
- Named constants for every limit and prefix. Comments say why, never what.
- Tests describe behaviour, not implementation, and each new rule has one that fails first.
- Task 12 runs `simplify` and `code-review` over the whole branch diff and fixes what they find before merging.

## Review Focus

- A relay room ID in the wrong form (uppercase hex, 63 or 65 characters, an old `PRT-...` name, a percent-encoded slash) gets 400 and never reaches a Durable Object. Tasks 1 and 8.
- A missing or malformed proof gets 401 from the Worker; a well-formed but foreign proof still completes the upgrade, receives `{"type":"denied"}` and is closed with 1008, and its messages are never processed. Tasks 8 and 9.
- Two devices connecting at the same moment to an unclaimed room with different proofs: exactly one is admitted, the other is denied. Tasks 8 and 9.
- `Sec-WebSocket-Protocol` carrying several protocols, whitespace, or a proof of the wrong length: the valid one is used or the request is refused, never a crash. Task 1.
- Someone pastes an old invite (`?room=...#<43 chars>`, `ROOM.<43 chars>`, a bare 43-character key) into the join box, the scan page or the `/join` URL: a message that names the old site, no navigation. Task 5.
- Chat apps append a period, wrap the link in `<>` or put it inside a sentence, and keys can end in `-` or `_`: all still parse. Task 5.
- After `denied` the provider never reconnects, not on a timer, not on `online`, not on returning to the foreground. Task 6.
- A stored group with a 43-character secret never opens a WebSocket, still opens offline, still exports, and shows the banner. Tasks 7 and 10.
- A crash-torn `.auth` file is a hard error, never "unclaimed", and a socket that sends an update and closes straight away still has its write stored. Task 9.
- The Docker image starts (the runtime stage copies only listed files). Task 9.
- The proof (`Sec-WebSocket-Protocol`) is not retained by Workers Logs. Task 10.

---

### Task 1: Shared room access rules

**Files:**
- Create: `src/lib/sync/room-access.js`
- Create: `src/lib/sync/room-access.test.ts`

**Interfaces:**
- Consumes: `payloadHash` from `src/lib/sync/relay-protocol.js` (existing).
- Produces, all from `room-access.js`:
  - `PROOF_PREFIX: 'kostos1.'`
  - `DENIED_MESSAGE: { type: 'denied' }` and `DENIED_CLOSE_CODE: 1008`
  - `parseRoomId(raw: string): string | null` (canonical 64 lowercase hex or null)
  - `isProofHash(value: string): boolean` (the same 64-hex shape; used to validate stored claims)
  - `parseProofProtocol(header: string | null | undefined): { protocol: string; proof: string } | null`
  - `parseSyncRequest(requestUrl: string | undefined, protocolHeader: string | undefined): { relayRoomId: string; proof: string } | null` (what the Node relays need from an upgrade request)
  - `proofHash(proof: string): Promise<string>` (sha256 hex of the proof text)
  - `hashesEqual(a: string, b: string): boolean` (constant time)

- [ ] **Step 1: Write the failing test**

Create `src/lib/sync/room-access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	hashesEqual,
	isProofHash,
	parseProofProtocol,
	parseRoomId,
	parseSyncRequest,
	PROOF_PREFIX,
	proofHash
} from './room-access.js';

const room = 'a1'.repeat(32);
const proof = 'A'.repeat(43);

describe('parseRoomId', () => {
	it('accepts exactly 64 lowercase hex characters', () => {
		expect(parseRoomId(room)).toBe(room);
	});

	it('rejects old room names, uppercase, wrong lengths and non-hex', () => {
		expect(parseRoomId('PRT-AB23-CD45')).toBeNull();
		expect(parseRoomId(room.toUpperCase())).toBeNull();
		expect(parseRoomId(room.slice(1))).toBeNull();
		expect(parseRoomId(`${room}0`)).toBeNull();
		expect(parseRoomId('g'.repeat(64))).toBeNull();
		expect(parseRoomId(`${room.slice(1)}\n`)).toBeNull();
		expect(parseRoomId('')).toBeNull();
	});
});

describe('parseProofProtocol', () => {
	it('reads a single offered protocol', () => {
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof}`)).toEqual({ protocol: `${PROOF_PREFIX}${proof}`, proof });
	});

	it('finds the proof among several protocols and tolerates spaces', () => {
		expect(parseProofProtocol(`chat, ${PROOF_PREFIX}${proof} , other`)?.proof).toBe(proof);
	});

	it('refuses missing headers, wrong prefixes and proofs of the wrong shape', () => {
		expect(parseProofProtocol(null)).toBeNull();
		expect(parseProofProtocol(undefined)).toBeNull();
		expect(parseProofProtocol('')).toBeNull();
		expect(parseProofProtocol(`other.${proof}`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof.slice(1)}`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${proof}x`)).toBeNull();
		expect(parseProofProtocol(`${PROOF_PREFIX}${'!'.repeat(43)}`)).toBeNull();
	});

	it('skips a malformed offer and still uses a valid one', () => {
		expect(parseProofProtocol(`${PROOF_PREFIX}short, ${PROOF_PREFIX}${proof}`)?.proof).toBe(proof);
	});
});

describe('parseSyncRequest', () => {
	const header = `${PROOF_PREFIX}${proof}`;

	it('reads the relay room ID and proof from an upgrade request', () => {
		expect(parseSyncRequest(`/sync/${room}`, header)).toEqual({ relayRoomId: room, proof });
		expect(parseSyncRequest(`/sync/${room}?x=1`, header)).toEqual({ relayRoomId: room, proof });
	});

	it('refuses other paths, old room names, bad escapes and missing proofs', () => {
		for (const bad of ['/', '/not-sync', '/sync/', '/sync/PRT-AAAA-BBBB', '/sync/%ZZ', `/sync/${room}/extra`, `/sync/${room.toUpperCase()}`]) {
			expect(parseSyncRequest(bad, header), bad).toBeNull();
		}
		expect(parseSyncRequest(`/sync/${room}`, undefined)).toBeNull();
		expect(parseSyncRequest(undefined, header)).toBeNull();
	});
});

describe('proof hashing', () => {
	it('hashes deterministically to 64 hex characters and tells proofs apart', async () => {
		const first = await proofHash(proof);
		expect(isProofHash(first)).toBe(true);
		expect(await proofHash(proof)).toBe(first);
		expect(await proofHash('B'.repeat(43))).not.toBe(first);
	});

	it('recognises only well formed hashes', () => {
		expect(isProofHash(room)).toBe(true);
		expect(isProofHash(room.toUpperCase())).toBe(false);
		expect(isProofHash('')).toBe(false);
		expect(isProofHash(`${room}\n`)).toBe(false);
	});

	it('compares hashes by value', () => {
		expect(hashesEqual('abc', 'abc')).toBe(true);
		expect(hashesEqual('abc', 'abd')).toBe(false);
		expect(hashesEqual('abc', 'abcd')).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/room-access.test.ts`
Expected: FAIL, cannot resolve `./room-access.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sync/room-access.js`:

```js
/* What every sync server checks before letting a socket into a room. Plain JS so the
 * Worker, the Node relays and the browser client share the same rules.
 */
import { payloadHash } from './relay-protocol.js';

export const PROOF_PREFIX = 'kostos1.';
/** Sent to a socket whose proof does not match the room, right before it is closed. A failed
 *  HTTP upgrade is invisible to browser JavaScript, so this is how a client learns it was refused. */
export const DENIED_MESSAGE = { type: 'denied' };
export const DENIED_CLOSE_CODE = 1008;

const SYNC_PATH_PREFIX = '/sync/';
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** @param {string} raw @returns {string | null} the relay room ID, or null unless it is 64 lowercase hex characters */
export function parseRoomId(raw) {
	return SHA256_HEX_PATTERN.test(raw) ? raw : null;
}

/** @param {string} value */
export function isProofHash(value) {
	return SHA256_HEX_PATTERN.test(value);
}

/** @param {string | null | undefined} header the Sec-WebSocket-Protocol request header
 *  @returns {{ protocol: string, proof: string } | null} */
export function parseProofProtocol(header) {
	for (const part of (header ?? '').split(',')) {
		const protocol = part.trim();
		if (!protocol.startsWith(PROOF_PREFIX)) continue;
		const proof = protocol.slice(PROOF_PREFIX.length);
		if (PROOF_PATTERN.test(proof)) return { protocol, proof };
	}
	return null;
}

/** What a Node relay needs from an upgrade request, or null if the path or the proof is unusable.
 *  @param {string | undefined} requestUrl @param {string | undefined} protocolHeader
 *  @returns {{ relayRoomId: string, proof: string } | null} */
export function parseSyncRequest(requestUrl, protocolHeader) {
	let relayRoomId = null;
	try {
		// fixed base so the Host header can't affect parsing; a malformed target still throws
		const { pathname } = new URL(requestUrl ?? '/', 'http://localhost');
		if (pathname.startsWith(SYNC_PATH_PREFIX)) relayRoomId = parseRoomId(decodeURIComponent(pathname.slice(SYNC_PATH_PREFIX.length)));
	} catch {
		return null;
	}
	const offered = parseProofProtocol(protocolHeader);
	return relayRoomId && offered ? { relayRoomId, proof: offered.proof } : null;
}

/** @param {string} proof */
export function proofHash(proof) {
	return payloadHash(new TextEncoder().encode(proof));
}

/** Constant-time comparison of two hex digests.
 *  @param {string} a @param {string} b */
export function hashesEqual(a, b) {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/room-access.test.ts`
Expected: PASS, 11 tests. (The nine tests that do not touch `parseSyncRequest` were run against this implementation in a scratch copy while drafting; the two `parseSyncRequest` tests and the final `DENIED_*` constants were not, so read any failure there as a plan bug and fix the plan too.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/room-access.js src/lib/sync/room-access.test.ts
git commit -m "feat(sync): add shared room access rules"
```

---

### Task 2: Derive key, local ID, relay room ID and proof from the secret

**Files:**
- Modify: `src/lib/sync/relay-protocol.js` (add `toHex`, make `payloadHash` use it)
- Modify: `src/lib/sync/crypto.ts`
- Modify: `src/lib/sync/crypto.test.ts`
- Modify: `src/lib/sync/provider.test.ts` (fake-timer tests wait for the socket)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `toHex(bytes: Uint8Array): string` from `relay-protocol.js` (one hex encoder for the whole codebase)
  - from `crypto.ts`: `type RoomAccess = { relayRoomId: string; proof: string }`; `deriveKey(secret): Promise<CryptoKey>` (same name, now HKDF, AES-128-GCM); `deriveLocalId(secret): Promise<string>`; `deriveRoomAccess(secret): Promise<RoomAccess>`; `base64UrlEncode(bytes): string`

The pinned vectors below were computed independently of the browser code, with Node's `hkdfSync`:

```bash
node -e "
const { hkdfSync, createDecipheriv } = require('node:crypto');
const secret = Buffer.from('AAECAwQFBgcICQoLDA0ODw', 'base64url');
const derive = (purpose, bytes) => Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'kostos/' + purpose + '/v1', bytes));
console.log('room ', derive('room', 32).toString('hex'));
console.log('auth ', derive('auth', 32).toString('base64url'));
console.log('local', derive('local', 16).toString('hex'));
const key = derive('encryption', 16);
const sealed = Buffer.from('BwcHBwcHBwcHBwcHUQkHPplByfuAT6mNcOrvGpioGf8sCl4WA1lCmg==', 'base64');
const decipher = createDecipheriv('aes-128-gcm', key, sealed.subarray(0, 12));
decipher.setAuthTag(sealed.subarray(sealed.length - 16));
console.log('plain', Buffer.concat([decipher.update(sealed.subarray(12, sealed.length - 16)), decipher.final()]).toString());
"
```

Output: `room  240d9fce...07c9`, `auth  _3Uo_pBmGvtA0V2fpVX1h0L-hz9fr3PSDdvJ9Cm3E3Q`, `local 17f3a7932681dc151d53e7f7b31d5811`, `plain hello kostos`. The `room` and `auth` values equal the ones in the earlier draft of this plan; `local` is new; the sealed payload (IV of twelve 0x07 bytes) still decrypts under the unchanged `encryption` derivation, so it stays the encryption vector.

- [ ] **Step 1: Write the failing tests**

In `src/lib/sync/crypto.test.ts`:

1. Replace the first import line with:

```ts
import { base64UrlEncode, decryptPayload, deriveKey, deriveLocalId, deriveRoomAccess, encryptPayload } from './crypto';
import { toHex } from './relay-protocol.js';
```

2. In `secretFromSeed`, change `new Uint8Array(32)` to `new Uint8Array(16)` so no test fixture is an old-format secret.
3. `deriveKey` is real async crypto from this task on, so three fake-timer tests in `src/lib/sync/provider.test.ts` stop seeing the socket after a single tick. Add this helper above `ready()`:

```ts
// key derivation is real async crypto, so a single fake-timer tick may not show the socket yet
async function socketsOpened(count = 1) {
	await vi.waitFor(() => expect(Socket.instances).toHaveLength(count));
}
```

and use it in the three tests: in 'treats a server it cannot reach as offline' add `await socketsOpened();` before `await vi.advanceTimersByTimeAsync(6_001);`; in 'keeps waiting while a long history is still arriving' replace `await vi.advanceTimersByTimeAsync(0);` with `await socketsOpened();`; in 'reports a timeout, not an outdated server, when an open connection goes silent' replace `await vi.advanceTimersByTimeAsync(0); Socket.instances[0].open();` with `await socketsOpened(); Socket.instances[0].open();`.
4. Append to `crypto.test.ts`:

```ts
describe('secret derivations', () => {
	const pinnedSecret = 'AAECAwQFBgcICQoLDA0ODw';
	const pinnedPayload = 'BwcHBwcHBwcHBwcHUQkHPplByfuAT6mNcOrvGpioGf8sCl4WA1lCmg==';

	it('matches pinned vectors, so a change that would orphan every group fails here', async () => {
		expect(await deriveRoomAccess(pinnedSecret)).toEqual({
			relayRoomId: '240d9fce60d8bf1f1f868e3d307862a79cf6e7e60e9605076bc36adce20a07c9',
			proof: '_3Uo_pBmGvtA0V2fpVX1h0L-hz9fr3PSDdvJ9Cm3E3Q'
		});
		expect(await deriveLocalId(pinnedSecret)).toBe('17f3a7932681dc151d53e7f7b31d5811');
		const payload = Uint8Array.from(atob(pinnedPayload), (c) => c.charCodeAt(0));
		const plain = await decryptPayload(await deriveKey(pinnedSecret), payload);
		expect(new TextDecoder().decode(plain)).toBe('hello kostos');
	});

	it('shapes every derived value for its job', async () => {
		const { relayRoomId, proof } = await deriveRoomAccess(pinnedSecret);
		expect(relayRoomId).toMatch(/^[0-9a-f]{64}$/);
		expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await deriveLocalId(pinnedSecret)).toMatch(/^[0-9a-f]{32}$/);
	});

	it('derives each purpose independently, so one value reveals nothing about another', async () => {
		const { relayRoomId, proof } = await deriveRoomAccess(pinnedSecret);
		const localId = await deriveLocalId(pinnedSecret);
		const proofHex = toHex(Buffer.from(proof, 'base64url'));
		expect(new Set([relayRoomId, proofHex, localId]).size).toBe(3);
		expect(relayRoomId.startsWith(localId)).toBe(false);
		expect(proofHex.startsWith(localId)).toBe(false);
		expect(proofHex.startsWith(relayRoomId.slice(0, localId.length))).toBe(false);
	});

	it('separates different secrets', async () => {
		const other = base64UrlEncode(new Uint8Array(16).fill(9));
		expect((await deriveRoomAccess(other)).relayRoomId).not.toBe((await deriveRoomAccess(pinnedSecret)).relayRoomId);
		expect(await deriveLocalId(other)).not.toBe(await deriveLocalId(pinnedSecret));
	});

	it('encodes bytes without padding', () => {
		expect(base64UrlEncode(new Uint8Array(16))).toHaveLength(22);
		expect(base64UrlEncode(Uint8Array.from([251, 255, 254]))).toBe('-__-');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/crypto.test.ts`
Expected: FAIL, `deriveLocalId` / `deriveRoomAccess` / `base64UrlEncode` / `toHex` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/sync/relay-protocol.js`, replace the final `payloadHash` with:

```js
/** @param {Uint8Array} bytes */
export function toHex(bytes) {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Uint8Array} payload */
export async function payloadHash(payload) {
	const hash = await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (payload));
	return toHex(new Uint8Array(hash));
}
```

Replace `src/lib/sync/crypto.ts` with:

```ts
/* AES-GCM helpers for the encrypted sync transport.
 *
 * A group's secret (16 random bytes, base64url) is the only thing its members share. HKDF-SHA-256
 * expands it into independent values, one per purpose: the AES-128-GCM key and the local ID stay on
 * the device; the relay room ID and the auth proof go to the sync server, which learns nothing about
 * the key from them. Each encrypted payload is `iv (12 bytes) | ciphertext+tag`. IVs are random per
 * message, which AES-GCM requires. The server sees only opaque ciphertext.
 */
import { toHex } from './relay-protocol.js';

const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

export type RoomAccess = { relayRoomId: string; proof: string };

/** Changing a purpose or a size orphans every existing group; crypto.test.ts pins them. */
async function expand(secretBase64Url: string, purpose: 'encryption' | 'local' | 'room' | 'auth', bits: number): Promise<Uint8Array> {
	const base = await crypto.subtle.importKey('raw', base64UrlDecode(secretBase64Url) as BufferSource, 'HKDF', false, ['deriveBits']);
	const info = new TextEncoder().encode(`kostos/${purpose}/v1`);
	const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, base, bits);
	return new Uint8Array(derived);
}

export async function deriveKey(secretBase64Url: string): Promise<CryptoKey> {
	const raw = await expand(secretBase64Url, 'encryption', 128);
	return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, KEY_USAGES);
}

/** The group's identity on this device: its `/p/<id>` route, storage key and IndexedDB name. */
export async function deriveLocalId(secretBase64Url: string): Promise<string> {
	return toHex(await expand(secretBase64Url, 'local', 128));
}

export async function deriveRoomAccess(secretBase64Url: string): Promise<RoomAccess> {
	const [room, proof] = await Promise.all([expand(secretBase64Url, 'room', 256), expand(secretBase64Url, 'auth', 256)]);
	return { relayRoomId: toHex(room), proof: base64UrlEncode(proof) };
}

export async function encryptPayload(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource)
	);
	const out = new Uint8Array(iv.length + ciphertext.length);
	out.set(iv, 0);
	out.set(ciphertext, iv.length);
	return out;
}

export async function decryptPayload(key: CryptoKey, payload: Uint8Array): Promise<Uint8Array> {
	if (payload.length < 12 + 16) throw new Error('payload too short');
	const iv = payload.slice(0, 12);
	const ciphertext = payload.slice(12);
	return new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext as BufferSource)
	);
}

export function base64UrlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
	const normalised = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
```

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run src/lib/sync/crypto.test.ts src/lib/sync/room-access.test.ts src/lib/sync/provider.test.ts`
Expected: PASS.
Run: `npm run check` and `npm test`
Expected: no errors and a fully green suite (302 tests at this point). No caller changes yet; `deriveKey` keeps its signature. Only commit once both are green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/relay-protocol.js src/lib/sync/crypto.ts src/lib/sync/crypto.test.ts src/lib/sync/provider.test.ts
git commit -m "feat(sync): derive key, local id, relay room id and proof from the secret with HKDF"
```

---

### Task 3: Provider connects with the derived room and proof

**Files:**
- Modify: `src/lib/sync/provider.ts` (imports, constructor ~line 48, `connect` ~line 104, `createSyncProvider` ~line 404)
- Modify: `src/lib/sync/doc.ts` (lines 57 and 83)
- Modify: `src/lib/sync/provider.test.ts`

**Interfaces:**
- Consumes: `deriveRoomAccess`, `RoomAccess` (Task 2); `PROOF_PREFIX` (Task 1).
- Produces:
  - `new EncryptedSyncProvider(doc: Y.Doc, url: string, secret: string, persistence?: RoomPersistence)` (the `roomId` argument is gone)
  - `createSyncProvider(doc: Y.Doc, url: string | undefined, secret: string, persistence?: RoomPersistence): EncryptedSyncProvider | null`

- [ ] **Step 1: Write the failing test and adapt the harness**

In `src/lib/sync/provider.test.ts`:

1. Extend the crypto import: `import { deriveKey, deriveRoomAccess, decryptPayload, encryptPayload } from './crypto';`
2. Make the fake socket remember how it was opened:

```ts
	constructor(public url = '', public protocols: string | string[] = []) { Socket.instances.push(this); }
```

3. Use a current-format secret: line 25 becomes `const secret = btoa(String.fromCharCode(...new Uint8Array(16).fill(1))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');`
4. Replace all five `new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret)` (lines 41, 141, 150, 156, 166) with `new EncryptedSyncProvider(doc, 'ws://test', secret)`.
5. The `socketsOpened()` helper already exists (added in Task 2). If another fake-timer test races the derivation, give it a `socketsOpened()` too; do not lengthen timeouts.
6. Add inside `describe('verified encrypted sync', ...)`:

```ts
	it('connects to the derived room and offers the auth proof as a subprotocol', async () => {
		await start();
		const access = await deriveRoomAccess(secret);
		expect(Socket.instances[0].url).toBe(`ws://test/${access.relayRoomId}`);
		expect(Socket.instances[0].protocols).toEqual([`kostos1.${access.proof}`]);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/provider.test.ts`
Expected: FAIL (the provider still treats the third argument as the room ID and opens `ws://test/<secret>`).

- [ ] **Step 3: Write the implementation**

In `src/lib/sync/provider.ts`:

- Imports: change the crypto import to `import { decryptPayload, deriveKey, deriveRoomAccess, encryptPayload, type RoomAccess } from './crypto';` and add `import { PROOF_PREFIX } from './room-access.js';`.
- Add a field next to `private revision = 0;`: `private access: RoomAccess | null = null;`
- Constructor head and first lines:

```ts
	constructor(private doc: Y.Doc, private url: string, secret: string, private persistence?: RoomPersistence) {
		this.key = deriveKey(secret);
		const access = deriveRoomAccess(secret);
```

- The call that starts the first connection becomes (the rest of its body and the `.catch` stay):

```ts
		void Promise.all([persistence?.ready ?? Promise.resolve(), this.key, access]).then(([, , derived]) => {
			this.access = derived;
			const hasData = doc.store.clients.size > 0;
```

- In `connect()`, right after the `navigator.onLine === false` block add `const access = this.access; if (!access) return;` (the constructor calls `connect()` once the room is derived) and replace the socket creation:

```ts
		try { ws = new WebSocket(`${this.url}/${access.relayRoomId}`, [`${PROOF_PREFIX}${access.proof}`]); }
```

- Factory:

```ts
export function createSyncProvider(doc: Y.Doc, url: string | undefined, secret: string, persistence?: RoomPersistence): EncryptedSyncProvider | null {
	if (!browser || !url) return null;
	return new EncryptedSyncProvider(doc, url, secret, persistence);
}
```

In `src/lib/sync/doc.ts` drop the `roomId` argument at both call sites:

```ts
createSyncProvider(cached.handle.doc, syncUrl(), effectiveSecret, cached.persistence)
createSyncProvider(doc, syncUrl(), effectiveSecret, persistence)
```

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run src/lib/sync/provider.test.ts`
Expected: PASS. If a fake-timer test still races the derivation, give it a `socketsOpened()` too; do not lengthen timeouts.
Run: `npm run check`
Expected: no errors. The pages still create old-style groups; they sync because derivation accepts any secret length.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/provider.ts src/lib/sync/doc.ts src/lib/sync/provider.test.ts
git commit -m "feat(sync): connect to the derived room and send the auth proof"
```

---

### Task 4: One shared way to create a group

`routes/new`, `routes/restore`, `routes/import` and `src/lib/demo.ts` each repeat the same sequence: make IDs, open the room, write the project, members and expenses, remember the group. Extract it before Task 5 changes the IDs, so the format switch touches one function.

**Files:**
- Create: `src/lib/io/restoreProject.ts`
- Create: `src/lib/io/restoreProject.test.ts`
- Modify: `src/routes/new/+page.svelte`, `src/routes/restore/+page.svelte`, `src/routes/import/+page.svelte`, `src/lib/demo.ts`

**Interfaces:**
- Consumes: `openRoom`, `initProject`, `addExpense`, `RoomHandle` (`src/lib/sync/doc.ts`); `addProject`, `setCurrentMember` (`src/lib/storage.ts`); `generateRoomId`, `generateSecret` (`src/lib/token.ts`, still the old ones until Task 5).
- Produces, from `restoreProject.ts`:
  - `type GroupContents = { project: Omit<Project, 'id'>; members: Member[]; expenses: Expense[] }`
  - `archiveContents(archive: ProjectArchive): GroupContents`
  - `seedRoom(handle: RoomHandle, project: Project, members: Member[], expenses: Expense[]): void` (header and members, then every expense in one transaction)
  - `createGroup(contents: GroupContents, currentMemberId: string | null): Promise<string>` (new secret and ID, seeds the room, saves the group, remembers "this is me" when given, flushes, returns the room ID)

What a restore does not carry over (also stated in the banner in Task 7 and in the README): the activity log and conflict history. `archiveContents` takes only project, members and expenses, and the person restoring picks who they are again.

- [ ] **Step 1: Write the failing test**

Create `src/lib/io/restoreProject.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addProject, setCurrentMember } from '$lib/storage';
import { openRoom, readExpenses, readMembers, readProject } from '$lib/sync/doc';
import type { Expense, Member } from '$lib/types';
import { parseProjectArchive } from './projectArchive';
import { archiveContents, createGroup, seedRoom } from './restoreProject';

vi.mock('$lib/storage', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/storage')>()),
	addProject: vi.fn(),
	setCurrentMember: vi.fn()
}));

const now = 1_700_000_000_000;
const members: Member[] = [
	{ id: 'anna', name: 'Anna', createdAt: now },
	{ id: 'marco', name: 'Marco', createdAt: now }
];
const expenses: Expense[] = [
	{
		id: 'dinner', description: 'Dinner', amount: 9000, currency: 'EUR', date: now, createdAt: now, createdBy: 'anna',
		payments: [{ memberId: 'anna', amount: 9000 }], splitMode: 'even', splits: [{ memberId: 'anna' }, { memberId: 'marco' }]
	}
];
const backup = {
	schemaVersion: 2, app: 'kostos', exportedAt: now,
	project: { name: 'Lisbon', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€', defaultSplit: 'even', createdAt: now, categories: [], paymentMethods: [] },
	members, expenses
};

function contents() {
	const parsed = parseProjectArchive(backup);
	if (!parsed.ok) throw new Error(parsed.error);
	return archiveContents(parsed.archive);
}

beforeEach(() => vi.clearAllMocks());

describe('archiveContents', () => {
	it('keeps what a backup holds and defaults the trips an old backup lacks', () => {
		const { project, members: restored, expenses: restoredExpenses } = contents();
		expect(project).toMatchObject({ name: 'Lisbon', currency: 'EUR', trips: [] });
		expect(restored).toEqual(members);
		expect(restoredExpenses).toEqual(expenses);
	});
});

describe('seedRoom', () => {
	it('writes the project, its members and every expense into the room', async () => {
		const handle = openRoom('SEED-ROOM');
		await handle.ready;
		seedRoom(handle, { ...contents().project, id: 'SEED-ROOM' }, members, expenses);
		expect(readProject(handle)).toMatchObject({ id: 'SEED-ROOM', name: 'Lisbon' });
		expect(readMembers(handle).map((member) => member.id)).toEqual(['anna', 'marco']);
		expect(readExpenses(handle)).toHaveLength(1);
	});
});

describe('createGroup', () => {
	it('saves the group under a fresh secret and remembers who you are', async () => {
		const roomId = await createGroup(contents(), 'marco');
		const saved = vi.mocked(addProject).mock.calls[0][0];
		expect(saved).toMatchObject({ roomId, name: 'Lisbon' });
		expect(saved.secret).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(setCurrentMember).toHaveBeenCalledWith(roomId, 'marco');
		expect(readProject(openRoom(roomId))?.id).toBe(roomId);
		expect(readExpenses(openRoom(roomId))).toHaveLength(1);
	});

	it('leaves the identity unset when none is chosen', async () => {
		await createGroup(contents(), null);
		expect(setCurrentMember).not.toHaveBeenCalled();
	});

	it('gives every group its own secret and ID', async () => {
		const first = await createGroup(contents(), null);
		const second = await createGroup(contents(), null);
		expect(first).not.toBe(second);
		expect(vi.mocked(addProject).mock.calls[0][0].secret).not.toBe(vi.mocked(addProject).mock.calls[1][0].secret);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/io/restoreProject.test.ts`
Expected: FAIL, cannot resolve `./restoreProject`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/io/restoreProject.ts`:

```ts
/* New, restore, import and the demo all end the same way: put a project into a room. */
import { addProject, setCurrentMember } from '$lib/storage';
import { addExpense, initProject, openRoom, type RoomHandle } from '$lib/sync/doc';
import { generateRoomId, generateSecret } from '$lib/token';
import type { Expense, Member, Project } from '$lib/types';
import type { ProjectArchive } from './projectArchive';

export type GroupContents = { project: Omit<Project, 'id'>; members: Member[]; expenses: Expense[] };

export function archiveContents({ project, members, expenses }: ProjectArchive): GroupContents {
	return { project: { ...project, trips: project.trips ?? [] }, members, expenses };
}

/** One transaction for the expenses, so the IndexedDB write is a single commit and observers fire once. */
export function seedRoom(handle: RoomHandle, project: Project, members: Member[], expenses: Expense[]): void {
	initProject(handle, project, members);
	handle.doc.transact(() => {
		for (const expense of expenses) addExpense(handle, expense);
	});
}

export async function createGroup({ project, members, expenses }: GroupContents, currentMemberId: string | null): Promise<string> {
	const secret = generateSecret();
	const roomId = generateRoomId();
	const handle = openRoom(roomId, secret);
	await handle.ready;
	seedRoom(handle, { ...project, id: roomId }, members, expenses);
	addProject({ roomId, secret, name: project.name, emoji: project.emoji, color: project.color, lastActiveAt: Date.now() });
	if (currentMemberId) setCurrentMember(roomId, currentMemberId);
	await handle.persistence?.flush();
	return roomId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/io/restoreProject.test.ts`
Expected: PASS. If the `fixture` backup is rejected, `parseProjectArchive` names the failing field in the thrown error; fix the fixture, not the validator.

- [ ] **Step 5: Use it from the pages and the demo**

`src/routes/restore/+page.svelte`: delete the imports of `addProject, setCurrentMember` (`$lib/storage`), `addExpense, initProject, openRoom` (`$lib/sync/doc`), `generateRoomId, generateSecret` (`$lib/token`) and `type Project` (`$lib/types`); add `import { archiveContents, createGroup } from '$lib/io/restoreProject';`. Replace the body of `onRestore` (keep its guards and `try/catch/finally`):

```ts
		try {
			const roomId = await createGroup(archiveContents(archive), youMemberId);
			await goto(`/p/${roomId}`);
		} catch (error) {
			parseError = error instanceof Error ? error.message : 'Could not save the group on this device';
		} finally { restoring = false; }
```

`src/routes/import/+page.svelte`: delete the imports of `addProject`, `addExpense, initProject, openRoom` and `generateRoomId, generateSecret` (line 7); add `import { createGroup } from '$lib/io/restoreProject';`. `confirmImport` becomes:

```ts
	async function confirmImport(): Promise<void> {
		if (!parsed || busy) return;
		busy = true;
		try {
			const roomId = await createGroup(parsed, null);
			await goto(`/p/${roomId}`);
		} catch (err) {
			busy = false;
			const message = err instanceof Error ? err.message : String(err);
			error = `Import failed: ${message}`;
		}
	}
```

`src/routes/new/+page.svelte`:
- Delete `import { addProject, setCurrentMember } from '$lib/storage';`, change `import { generateId, initProject, openRoom } from '$lib/sync/doc';` to `import { generateId } from '$lib/sync/doc';`, delete `import { generateRoomId, generateSecret } from '$lib/token';`, and add `import { createGroup } from '$lib/io/restoreProject';`.
- Delete `const roomId = generateRoomId();` and `const secret = generateSecret();` (lines 22 and 23).
- In `onSubmit`, type the object as `const project: Omit<Project, 'id'> = {` and remove its `id: roomId,` line; replace everything from `const handle = openRoom(roomId, secret);` through `await goto(`/p/${roomId}`);` with:

```ts
			const roomId = await createGroup({ project, members: [creator, ...otherMembers], expenses: [] }, creator.id);
			await goto(`/p/${roomId}`);
```

- The "Your share token will be" card (`<div class="card token-card">` around lines 274 to 278, which printed the generated room ID) has nothing left to show: delete the whole `<div>` and the `.token-card` and `.token-hint` rules in the `<style>` block (around lines 436 to 447).

`src/lib/demo.ts`: replace the seeding block (from `const a = parsed.archive;` to the closing of the `transact`) with:

```ts
		const { project, members, expenses } = archiveContents(parsed.archive);
		const youId = members[0]?.id ?? null;
		if (youId) setCurrentMember(DEMO_ROOM_ID, youId);
		seedRoom(handle, { ...project, id: DEMO_ROOM_ID }, members, expenses);
```

and fix the imports: `import { archiveContents, seedRoom } from './io/restoreProject';`, drop `addExpense, initProject` from the `./sync/doc` import (keep `openRoom`), drop `import type { Project } from './types';` and drop `import { parseProjectArchive } ...` only if unused (it is still used by the `parsed` line, keep it).

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: no errors and no unused-import warnings in the four edited files.
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/io/restoreProject.ts src/lib/io/restoreProject.test.ts src/routes/new/+page.svelte src/routes/restore/+page.svelte src/routes/import/+page.svelte src/lib/demo.ts
git commit -m "refactor: create groups through one shared function"
```

---

### Task 5: Invites, local IDs and the join flow

**Files:**
- Create: `src/lib/legacy.ts`, `src/lib/legacy.test.ts`
- Rewrite: `src/lib/token.ts`, `src/lib/token.test.ts`
- Modify: `src/lib/io/restoreProject.ts`, `src/lib/io/restoreProject.test.ts`
- Modify: `src/lib/sync/describe.ts`, `src/lib/sync/describe.test.ts`, `src/lib/components/SyncStatus.svelte`
- Modify: `src/routes/+page.svelte`, `src/routes/scan/+page.svelte`, `src/routes/join/+page.svelte`, `src/lib/components/ProjectAppBar.svelte`, `src/lib/styles/app.css`, `src/lib/storage.ts`, `src/app.html`, `src/routes/p/[roomId]/settings/+page.svelte`, `src/lib/io/projectArchive.test.ts`

**Interfaces:**
- Consumes: `base64UrlEncode`, `deriveLocalId` (Task 2); `createGroup` (Task 4).
- Produces:
  - `legacy.ts`: `isLegacySecret(secret: string): boolean` (43 base64url characters)
  - `token.ts`: `type ParsedToken = { secret: string }`; `generateSecret(): string` (22 characters); `isValidSecret(value: string): boolean`; `parseToken(raw: string): ParsedToken | null`; `isOldInvite(raw: string): boolean`; `OLD_INVITE_MESSAGE`, `INVALID_INVITE_MESSAGE`, `inviteError(raw: string): string`
  - `SyncView.label` becomes `string` (never null)
- Removed: `generateRoomId`, the `PRT` alphabet, `ROOM_PATTERN`, the `?room=` handling.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/legacy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isLegacySecret } from './legacy';

const legacy = Buffer.alloc(32, 7).toString('base64url');
const current = Buffer.alloc(16, 7).toString('base64url');

describe('isLegacySecret', () => {
	it('recognises the 43 character secrets earlier versions generated', () => {
		expect(legacy).toHaveLength(43);
		expect(isLegacySecret(legacy)).toBe(true);
	});

	it('does not mistake a current secret, another length or stray characters', () => {
		expect(current).toHaveLength(22);
		expect(isLegacySecret(current)).toBe(false);
		expect(isLegacySecret(legacy.slice(1))).toBe(false);
		expect(isLegacySecret(`${legacy}x`)).toBe(false);
		expect(isLegacySecret(`${legacy.slice(1)}!`)).toBe(false);
		expect(isLegacySecret('')).toBe(false);
	});
});
```

Replace `src/lib/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateSecret, inviteError, INVALID_INVITE_MESSAGE, isOldInvite, isValidSecret, OLD_INVITE_MESSAGE, parseToken } from './token';

const secret = 'AAECAwQFBgcICQoLDA0ODw';
const legacySecret = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

describe('parseToken', () => {
	it('reads the share link the app hands out', () => {
		expect(secret).toHaveLength(22);
		expect(parseToken(`https://kostos.example/join#${secret}`)).toEqual({ secret });
	});

	it('reads links pasted without a scheme, wrapped, or inside a sentence', () => {
		const link = `kostos.example/join#${secret}`;
		expect(parseToken(link)).toEqual({ secret });
		expect(parseToken(`<https://${link}>`)).toEqual({ secret });
		expect(parseToken(`Join us here: https://${link}.`)).toEqual({ secret });
		expect(parseToken(`(https://${link})`)).toEqual({ secret });
	});

	it('reads the bare key and keeps its case', () => {
		expect(parseToken(`  ${secret} `)).toEqual({ secret });
		expect(parseToken('abc-_ABC-_abc-_ABC-_ab')).toEqual({ secret: 'abc-_ABC-_abc-_ABC-_ab' });
	});

	it('keeps keys that end in - or _', () => {
		expect(parseToken('https://kostos.example/join#abcdefghijklmnopqrst-_')).toEqual({ secret: 'abcdefghijklmnopqrst-_' });
	});

	it('rejects the old link and key forms', () => {
		expect(legacySecret).toHaveLength(43);
		expect(parseToken(`https://kostos.example/join?room=PRT-AB23-CD45#${legacySecret}`)).toBeNull();
		expect(parseToken(`PRT-AB23-CD45.${legacySecret}`)).toBeNull();
		expect(parseToken(legacySecret)).toBeNull();
		expect(parseToken('PRT-AB23-CD45')).toBeNull();
	});

	it('rejects links without a key, wrong lengths and stray characters', () => {
		expect(parseToken('https://kostos.example/join')).toBeNull();
		expect(parseToken(secret.slice(1))).toBeNull();
		expect(parseToken(`${secret}x`)).toBeNull();
		expect(parseToken(`${secret}<script>`)).toBeNull();
		expect(parseToken('')).toBeNull();
	});
});

describe('old invites', () => {
	it('recognises every form the old site produced', () => {
		expect(isOldInvite(`https://kostos.example/join?room=PRT-AB23-CD45#${legacySecret}`)).toBe(true);
		expect(isOldInvite('Join: https://kostos.example/join?room=PRT-AB23-CD45 please')).toBe(true);
		expect(isOldInvite(`https://kostos.example/join#PRT-AB23-CD45.${legacySecret}`)).toBe(true);
		expect(isOldInvite(`PRT-AB23-CD45.${legacySecret}`)).toBe(true);
		expect(isOldInvite(legacySecret)).toBe(true);
	});

	it('does not flag current invites or plain mistakes', () => {
		expect(isOldInvite(`https://kostos.example/join#${secret}`)).toBe(false);
		expect(isOldInvite(secret)).toBe(false);
		expect(isOldInvite('https://kostos.example/join')).toBe(false);
		expect(isOldInvite('hello')).toBe(false);
		expect(isOldInvite('')).toBe(false);
	});

	it('answers an old invite with a message that says it is from the old site', () => {
		expect(inviteError(legacySecret)).toBe(OLD_INVITE_MESSAGE);
		expect(OLD_INVITE_MESSAGE).toContain('old Kostos site');
		expect(inviteError('hello')).toBe(INVALID_INVITE_MESSAGE);
	});
});

describe('generateSecret', () => {
	it('makes valid, distinct 22 character secrets', () => {
		const first = generateSecret();
		expect(first).toHaveLength(22);
		expect(isValidSecret(first)).toBe(true);
		expect(generateSecret()).not.toBe(first);
	});
});
```

In `src/lib/io/restoreProject.test.ts`, add the import `import { deriveLocalId } from '$lib/sync/crypto';` and replace the assertion `expect(saved.secret).toMatch(/^[A-Za-z0-9_-]+$/);` in the first `createGroup` test with:

```ts
		expect(saved.secret).toHaveLength(22);
		expect(roomId).toMatch(/^[0-9a-f]{32}$/);
		expect(roomId).toBe(await deriveLocalId(saved.secret));
```

In `src/lib/sync/describe.test.ts` change the first test's expectation to `label: 'Up to date'` and add:

```ts
	it('labels the demo group as local only', () => {
		expect(describeSync(LOCAL_STATUS, null, NOW, { demo: true }).label).toBe('Only on this phone');
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/legacy.test.ts src/lib/token.test.ts src/lib/io/restoreProject.test.ts src/lib/sync/describe.test.ts`
Expected: FAIL (`./legacy` missing, `isOldInvite` and friends missing, local ID still `PRT-...`, labels still `null`).

- [ ] **Step 3: Write `legacy.ts` and rewrite `token.ts`**

Create `src/lib/legacy.ts`:

```ts
/* Groups made before v3 hold a 32 byte secret (43 base64url characters). Their server rooms were
 * addressed differently, so they can no longer sync; they stay readable from the data on the device
 * until someone exports and restores them as a new group. */
const LEGACY_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isLegacySecret(secret: string): boolean {
	return LEGACY_SECRET_PATTERN.test(secret);
}
```

Replace `src/lib/token.ts`:

```ts
/* Invites. A group's invite is its secret: 16 random bytes as 22 base64url characters, shared as
 *     https://<host>/join#<secret>
 * Browsers don't send `#...` in requests, so the secret stays out of server logs and referers.
 * Every other identifier (key, local ID, relay room ID, proof) is derived from it in sync/crypto.ts.
 */
import { isLegacySecret } from './legacy';
import { base64UrlEncode } from './sync/crypto';

export type ParsedToken = { secret: string };

const SECRET_BYTES = 16;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const OLD_INVITE_MESSAGE = 'That invite comes from the old Kostos site and no longer works. Ask your group for a new invite link.';
export const INVALID_INVITE_MESSAGE = 'That does not look right. Paste the full invite link or the 22 character group key.';

export function generateSecret(): string {
	const bytes = new Uint8Array(SECRET_BYTES);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export function isValidSecret(value: string): boolean {
	return SECRET_PATTERN.test(value);
}

/** Accepts the share link (`/join#SECRET`) or the bare secret. */
export function parseToken(raw: string): ParsedToken | null {
	const key = keyOf(extractCandidate(raw));
	return isValidSecret(key) ? { secret: key } : null;
}

/** Invites from before v3: `?room=` links, `ROOM.SECRET` pairs and bare 43 character keys. */
export function isOldInvite(raw: string): boolean {
	const candidate = extractCandidate(raw);
	if (candidate.includes('room=')) return true;
	const key = keyOf(candidate);
	return isLegacySecret(key.includes('.') ? key.slice(key.indexOf('.') + 1) : key);
}

export function inviteError(raw: string): string {
	return isOldInvite(raw) ? OLD_INVITE_MESSAGE : INVALID_INVITE_MESSAGE;
}

function keyOf(candidate: string): string {
	const hash = candidate.indexOf('#');
	return hash === -1 ? candidate : candidate.slice(hash + 1);
}

/** Chat apps paste links with surrounding text, `<...>` wrappers, a sentence's final period,
 *  or without the scheme. None of those characters can appear in a secret. */
function extractCandidate(raw: string): string {
	const words = raw.trim().split(/\s+/);
	const word = words.find((w) => w.includes('#') || w.includes('room=')) ?? words[words.length - 1] ?? '';
	return word.replace(/^[<(]+/, '').replace(/[.,;:!?)>]+$/, '');
}
```

In `src/lib/io/restoreProject.ts` replace the imports `import { generateRoomId, generateSecret } from '$lib/token';` with `import { deriveLocalId } from '$lib/sync/crypto';` and `import { generateSecret } from '$lib/token';`, and in `createGroup` replace `const roomId = generateRoomId();` with `const roomId = await deriveLocalId(secret);`.

In `src/lib/sync/describe.ts`: change the type to `/** Short text for the app bar line under the group name. */ label: string;`, the demo branch to `label: 'Only on this phone'`, and the synced branch to `label: 'Up to date'`.

In `src/lib/components/SyncStatus.svelte`: line 8 comment becomes `/** \`line\` shows the sync state under the group name; \`dot\` is ...` (keep the rest of the sentence), line 22 becomes `const text = $derived(view?.label ?? '');`, and line 64 loses its `class:code={view.label === null}` attribute. Run `rg -n "\.code\b" src/lib/components/SyncStatus.svelte src/lib/styles` and delete any rule that only served that class.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/legacy.test.ts src/lib/token.test.ts src/lib/io/restoreProject.test.ts src/lib/sync/describe.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the pages, remove every label display, sweep the copy**

**Label displays to remove.** The room ID (formerly the `PRT-XXXX-XXXX` label) is shown in five places, one more than the spec lists:

| Where | Change |
| --- | --- |
| `src/routes/new/+page.svelte` | Already removed in Task 4. |
| `src/lib/components/ProjectAppBar.svelte` line 96 (`<span class="token-pill">{roomId}</span>`) | Delete the line; change the eyebrow on line 85 from `Invite token` to `Invite link`; the hint (lines 104 to 106) becomes `Anyone with this link can join the group. The key sits after the # in the link, so the server never receives it.` Then delete the `.token-pill` rule (and its `/* Token display */` comment) from `src/lib/styles/app.css` (lines 527 to 539); nothing else uses it. |
| `src/routes/join/+page.svelte` line 135 (error text naming `{roomId}`) | `Group data isn’t available yet. Check your connection and use the full invite link shared by your group.` |
| `src/routes/join/+page.svelte` line 154 (`... members · {roomId}`) | Show the member count only. |
| `SyncStatus.svelte` under the group name | Done in Step 3 (`label` is now text such as `Up to date`). |

**Fixture leftover.** `src/lib/io/projectArchive.test.ts` line 16 uses `id: 'PRT-AAAA-BBBB'` as a sample project ID; change it to `id: 'room-1'` so the final `PRT-` search has nothing to explain.

**Join box** (`src/routes/+page.svelte`): import `import { inviteError, parseToken } from '$lib/token';` and replace `onJoinSubmit`:

```ts
	function onJoinSubmit(event: SubmitEvent) {
		event.preventDefault();
		const parsed = parseToken(token);
		if (!parsed) {
			error = inviteError(token);
			return;
		}
		error = null;
		goto(`/join#${parsed.secret}`);
	}
```

On the input: `placeholder="Invite link or group key"` and `autocapitalize="off"` (keys are case sensitive; `characters` would corrupt them on phone keyboards). Eyebrow `Paste an invite link or group key`. Hint under the input: `PASTE THE LINK, OR JUST THE 22 CHARACTERS AFTER THE #`.

**Scan page** (`src/routes/scan/+page.svelte`): import `isOldInvite, OLD_INVITE_MESSAGE, parseToken`; `goto(`/join#${parsed.secret}`);` on line 20; in the scan callback the `else` branch becomes `detail = isOldInvite(text) ? OLD_INVITE_MESSAGE : 'That QR code is not a Kostos invite. Try another.';`.

**Join page** (`src/routes/join/+page.svelte`). Imports: `import { deriveLocalId } from '$lib/sync/crypto';` and `import { isOldInvite, isValidSecret, OLD_INVITE_MESSAGE } from '$lib/token';`. Replace the `roomId` and `secret` declarations (lines 22 and 23):

```ts
	const secret = $derived.by(() => {
		const hash = page.url.hash.startsWith('#') ? page.url.hash.slice(1) : '';
		return isValidSecret(hash) ? hash : '';
	});
	const oldInvite = $derived(isOldInvite(`${page.url.search}${page.url.hash}`));
	let roomId = $state('');
	$effect(() => {
		const current = secret;
		roomId = '';
		if (!current) return;
		let stale = false;
		void deriveLocalId(current).then((id) => { if (!stale) roomId = id; });
		return () => { stale = true; };
	});
```

In the status effect replace `if (!room) { status = 'invalid'; return; }` with:

```ts
		if (!secret) { status = 'invalid'; return; }
		if (!room) { status = 'parsing'; return; }
```

The invalid card (line 121) becomes:

```svelte
				{#if oldInvite}
					<p>{OLD_INVITE_MESSAGE}</p>
				{:else}
					<p>This invite link is missing the group key. Ask the sender to share the full link from their <strong>Share</strong> button.</p>
				{/if}
```

and the loading hint (line 129) `Decrypting with your group key. The server never sees the contents.`

**`ProjectAppBar.svelte`** line 22: `return `${location.origin}/join#${stored.secret}`;`

**`src/lib/storage.ts`** comments: `roomId` becomes `/** Local ID of the group: its \`/p/<id>\` route, storage key and IndexedDB name. Derived from the secret (32 hex characters); groups from before v3 keep their old short name. Never sent to the server. */` and `secret` becomes `/** The group's only shared value. Lives in the invite link's fragment and in localStorage; the server never sees it. */`.

**Copy sweep: "token" becomes "invite link" (the URL) or "group key" (the 22 characters).** Verified with `rg -n -i "token" src README.md e2e` on 2026-10-16; these are all the user-facing hits:

| File and line | New wording |
| --- | --- |
| `src/app.html:10` | `Share a token,` becomes `Share an invite link,` |
| `src/routes/+page.svelte:59` (meta description) and `:68` (JSON-LD description) | `Share a token,` becomes `Share an invite link,` |
| `src/routes/+page.svelte:91` (JSON-LD FAQ) and `:399-400` (visible FAQ, same answer) | `No. Each group is identified by a secret key. Share the invite link to bring others in; anyone with it joins the group. No email, no password, no sign-up.` |
| `:99` (JSON-LD FAQ) and `:405-408` (visible FAQ) | `... never has access to the group key` (in the visible copy: `... never has access to the group key, so it cannot read your expenses even if compromised.`) |
| `:123` (JSON-LD FAQ) and `:431-432` (visible FAQ) | `Yes. Anyone with the invite link can join from another device. ... between every device that holds the group key` |
| `:250` button | `Join with invite link` |
| `:294` | `... the group key is never sent to it.` |
| `:305` | `A group is just a shareable invite link. Send it; everyone joins.` |
| `:317` | `Every device with the group key sees ...` |
| `:361` | `The app generates a secret key for the group locally on your device.` |
| `:368` heading | `Share the invite link` |
| `src/routes/scan/+page.svelte:111` | `Paste the invite link instead.` |
| `src/routes/scan/+page.svelte:123` | `Paste an invite link instead` |
| `src/routes/join/+page.svelte:129` | done above |
| `src/routes/p/[roomId]/settings/+page.svelte:332` | `Rejoin with the invite link to restore it.` |

The JSON-LD answers and the visible answers must keep saying the same thing. README lines are handled in Task 10. Internal identifiers (`tokenInputOpen`, `token`, `tokenForm`, the `.token-form` and `.token-input` CSS classes, `tokens.css`) stay; renaming them is churn with no user-facing value. Confirm nothing visible is missed with `rg -n -i "\btoken\b" src --glob '*.svelte' --glob '*.html' | rg -v "tokens.css|lib/token|token-|tokenForm|tokenInputOpen|let token|bind:value=\{token\}|parseToken\(token\)|inviteError\(token\)"` and expect no output.

- [ ] **Step 6: Verify**

Run: `rg -n "generateRoomId|parsed\.roomId|deriveLabel|ROOM_PATTERN|ROOM_ALPHABET" src`
Expected: no matches.
Run: `npm run check`
Expected: no errors.
Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: make the group secret the whole invite and derive the local id"
```

---

### Task 6: Provider handles `denied`

The state model today (`src/lib/sync/provider.ts`, `status.ts`, `describe.ts`): `SyncStatus.phase` is `local | loading | connecting | syncing | synced | offline | error`; `problem` is a `SyncProblem`; `fail(problem, reconnect)` sets `phase: 'error'`, and `reconnect = false` skips the retry timer. But three other paths still reconnect: `retry()` (the `online` event, returning to the foreground, `pageshow`), `scheduleReconnect()` and `onclose` (which calls `recover`). A terminal state has to shut all of them.

**Files:**
- Modify: `src/lib/sync/status.ts`, `src/lib/sync/describe.ts`, `src/lib/sync/provider.ts`
- Modify: `src/lib/sync/describe.test.ts`, `src/lib/sync/provider.test.ts`

**Interfaces:**
- Consumes: `fail`, `connect`, `receiveControl` in `EncryptedSyncProvider`.
- Produces: `SyncProblem` gains `'denied'`; the server message `{ type: 'denied' }` ends in `phase: 'error'`, `problem: 'denied'`, no further sockets.

- [ ] **Step 1: Write the failing tests**

`src/lib/sync/describe.test.ts`, add:

```ts
	it('words a refused key as a terminal problem with no retry', () => {
		const view = describeSync(status({ phase: 'error', problem: 'denied' }), null, NOW);
		expect(view).toMatchObject({ state: 'error', tone: 'warn', retry: false });
		expect(view.body).toBe('This group belongs to a different key. Ask for a fresh invite link.');
		expect(view.banner).toBe(view.body);
	});
```

`src/lib/sync/provider.test.ts`, add inside `describe('verified encrypted sync', ...)`:

```ts
	it('stops for good when the server says the key does not belong to this group', async () => {
		vi.useFakeTimers();
		provider = new EncryptedSyncProvider(doc, 'ws://test', secret);
		await socketsOpened();
		const ws = Socket.instances[0]; ws.open();
		ws.control({ type: 'denied' });
		await vi.waitFor(() => expect(provider.snapshot.problem).toBe('denied'));
		// the server closes right after the message; the message task runs first in a browser too
		ws.close();
		expect(provider.status).toBe('error');
		await vi.advanceTimersByTimeAsync(120_000);
		document.dispatchEvent(new Event('visibilitychange'));
		events.dispatchEvent(new Event('online'));
		provider.retry();
		expect(Socket.instances).toHaveLength(1);
		expect(provider.snapshot).toMatchObject({ phase: 'error', problem: 'denied', checking: false });
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/sync/describe.test.ts src/lib/sync/provider.test.ts`
Expected: FAIL (type error is not enforced at runtime, so: `body` is the `network` text, `retry` is true, and the provider opens a second socket).

- [ ] **Step 3: Implement**

`src/lib/sync/status.ts`: add `'denied'` to `SyncProblem` and to `PROBLEM_LABELS`:

```ts
	denied: 'This group belongs to a different key. Ask for a fresh invite link.'
```

`src/lib/sync/describe.ts`: add the same sentence to `BANNER_TEXT` (key `denied`) and, in the `case 'error'` branch, change `retry: true` to `retry: sync.problem !== 'denied'`.

`src/lib/sync/provider.ts`:
- Field next to `private seeded`: `private denied = false;`
- First line of `connect()`: `if (this.destroyed || this.denied) return;`
- In `receiveControl`, right after the JSON is parsed and checked: `if (message.type === 'denied') { this.deny(); return; }`
- New method next to `fail`:

```ts
	/** The server refused this key for this room. Retrying cannot change that, so every path
	 *  that would reconnect (timers, online, foreground) stops at `denied` in `connect()`. */
	private deny(): void {
		this.denied = true;
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		try { ws?.close(); } catch { /* Already closed. */ }
		this.fail('denied', false);
	}
```

Setting `this.ws = null` makes `isCurrent(ws)` false, so the `onclose` that follows the server's 1008 is ignored instead of triggering `recover('network')`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/sync`
Expected: PASS. Run `npm run check`; `Record<SyncProblem, string>` makes the compiler point at any map that missed the new key.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync
git commit -m "feat(sync): stop retrying and say so when the server denies the key"
```

---

### Task 7: Legacy groups

For self-hosters upgrading in place (spec, "Upgrading a self-hosted server"). A stored group with a 43-character secret keeps its local data and its old `PRT-XXXX-XXXX` route; v3 must not try to sync it, because it would derive an unrelated room and a fresh proof from an old secret.

**Files:**
- Create: `src/lib/io/exportFiles.ts`, `src/lib/io/exportFiles.test.ts`
- Create: `src/lib/sync/doc.legacy.test.ts`
- Create: `src/lib/components/LegacyGroupBanner.svelte`
- Modify: `src/lib/sync/doc.ts`, `src/lib/sync/useRoom.svelte.ts`, `src/lib/sync/describe.ts`, `src/lib/sync/describe.test.ts`
- Modify: `src/lib/components/SyncStatus.svelte`, `src/lib/components/SyncBanner.svelte`, `src/lib/components/ProjectAppBar.svelte`, `src/lib/demo.ts`
- Modify: `src/routes/p/[roomId]/settings/+page.svelte`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `isLegacySecret` (Task 5), `isValidSecret` (Task 5), `createSyncProvider` (Task 3).
- Produces:
  - `exportFiles.ts`: `type DownloadableFile = { name: string; mime: string; contents: string }`; `backupFile(project, members, expenses, now?: Date): DownloadableFile`; `spreadsheetFile(...)` (same shape); `saveFile(file): void` (browser download)
  - `doc.ts`: `DEMO_ROOM_ID`; `RoomHandle.legacy: boolean`; only a current-format secret ever reaches `createSyncProvider`
  - `describeSync(..., { demo?, legacy? })` with `state: 'legacy'`; `RoomState.syncView(now): SyncView`

**3a. Share the backup download code (own commit, so the `legacy` branch can cherry-pick it in Task 11).**

- [ ] **Step 1: Write the failing test**

Create `src/lib/io/exportFiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Expense, Member, Project } from '$lib/types';
import { backupFile, spreadsheetFile } from './exportFiles';
import { parseProjectArchive } from './projectArchive';

const now = 1_700_000_000_000;
const project: Project = {
	id: 'x', name: 'Lisbon Weekend', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€',
	defaultSplit: 'even', categories: [], paymentMethods: [], trips: [], createdAt: now
};
const members: Member[] = [{ id: 'anna', name: 'Anna', createdAt: now }];
const expenses: Expense[] = [{
	id: 'e1', description: 'Dinner', amount: 1000, currency: 'EUR', date: now, createdAt: now, createdBy: 'anna',
	payments: [{ memberId: 'anna', amount: 1000 }], splitMode: 'even', splits: [{ memberId: 'anna' }]
}];
const day = new Date('2026-10-16T12:00:00Z');

describe('export files', () => {
	it('names the backup after the group and the day, and the file restores', () => {
		const file = backupFile(project, members, expenses, day);
		expect(file).toMatchObject({ name: 'kostos-lisbon-weekend-2026-10-16.json', mime: 'application/json' });
		expect(parseProjectArchive(file.contents)).toMatchObject({ ok: true });
	});

	it('falls back to a generic name when the group name has no usable characters', () => {
		expect(backupFile({ ...project, name: '🏖🏖' }, members, expenses, day).name).toBe('kostos-project-2026-10-16.json');
	});

	it('names the spreadsheet the same way', () => {
		const file = spreadsheetFile(project, members, expenses, day);
		expect(file).toMatchObject({ name: 'kostos-lisbon-weekend-2026-10-16.csv', mime: 'text/csv' });
		expect(file.contents).toContain('description');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/io/exportFiles.test.ts`
Expected: FAIL, cannot resolve `./exportFiles`.

- [ ] **Step 3: Implement and use it**

Create `src/lib/io/exportFiles.ts` (the code moves out of the settings page, lines 94 to 133):

```ts
import type { Expense, Member, Project } from '$lib/types';
import { serializeProject, toCSV } from './projectArchive';

export type DownloadableFile = { name: string; mime: string; contents: string };

function slug(value: string): string {
	const cleaned = value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return cleaned || 'project';
}

function fileName(project: Project, now: Date, extension: string): string {
	return `kostos-${slug(project.name)}-${now.toISOString().slice(0, 10)}.${extension}`;
}

export function backupFile(project: Project, members: Member[], expenses: Expense[], now = new Date()): DownloadableFile {
	return {
		name: fileName(project, now, 'json'),
		mime: 'application/json',
		contents: JSON.stringify(serializeProject(project, members, expenses), null, 2)
	};
}

export function spreadsheetFile(project: Project, members: Member[], expenses: Expense[], now = new Date()): DownloadableFile {
	return { name: fileName(project, now, 'csv'), mime: 'text/csv', contents: toCSV(project, members, expenses) };
}

export function saveFile({ name, mime, contents }: DownloadableFile): void {
	const url = URL.createObjectURL(new Blob([contents], { type: mime }));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoke after the click finishes so Safari has time to start the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

In `src/routes/p/[roomId]/settings/+page.svelte`: replace the import on line 15 with `import { backupFile, saveFile, spreadsheetFile } from '$lib/io/exportFiles';`, delete `downloadFile`, `slug`, `exportJson` and `exportCsv` (lines 94 to 133) and put back:

```ts
	function exportJson() {
		if (project) saveFile(backupFile(project, members, expenses));
	}

	function exportCsv() {
		if (project) saveFile(spreadsheetFile(project, members, expenses));
	}
```

The two `onclick={exportJson}` / `onclick={exportCsv}` rows (lines 300 and 313) stay.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run src/lib/io && npm run check`
Expected: PASS, no errors.

```bash
git add src/lib/io/exportFiles.ts src/lib/io/exportFiles.test.ts "src/routes/p/[roomId]/settings/+page.svelte"
git commit -m "refactor: share the backup download helper"
```

**3b. Old-format groups never sync.**

- [ ] **Step 5: Write the failing tests**

Create `src/lib/sync/doc.legacy.test.ts`. `browser` is false under Vitest, so the test turns it on and replaces the three collaborators that touch the browser:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findProject, type ProjectRef } from '$lib/storage';
import { initProject, openRoom, readProject } from './doc';
import { createSyncProvider } from './provider';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('./provider', () => ({ createSyncProvider: vi.fn(() => ({ destroy: vi.fn() })) }));
vi.mock('./persistence', () => ({
	RoomPersistence: class {
		ready = Promise.resolve();
		state = {};
		onChange() { return () => {}; }
		async destroy() {}
		async clearData() {}
	}
}));
vi.mock('$lib/storage', () => ({ findProject: vi.fn(), getCurrentMember: vi.fn() }));

const legacySecret = Buffer.alloc(32, 7).toString('base64url');
const currentSecret = Buffer.alloc(16, 7).toString('base64url');
const stored = (roomId: string, secret: string) => vi.mocked(findProject).mockReturnValue({ roomId, secret, name: 'Group' } as ProjectRef);

beforeEach(() => vi.mocked(createSyncProvider).mockClear());

describe('openRoom with an old-format secret', () => {
	it('never starts a sync provider for a stored legacy group', () => {
		stored('PRT-OLD1', legacySecret);
		const handle = openRoom('PRT-OLD1');
		expect(handle.legacy).toBe(true);
		expect(handle.syncProvider).toBeUndefined();
		expect(createSyncProvider).not.toHaveBeenCalled();
	});

	it('does not let a join link with an old secret start one either', () => {
		const handle = openRoom('PRT-OLD2', legacySecret);
		expect(handle.legacy).toBe(true);
		expect(createSyncProvider).not.toHaveBeenCalled();
	});

	it('still opens the group from local data', async () => {
		stored('PRT-OLD3', legacySecret);
		const handle = openRoom('PRT-OLD3');
		await handle.ready;
		initProject(handle, {
			id: 'PRT-OLD3', name: 'Old group', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€',
			defaultSplit: 'even', categories: [], paymentMethods: [], trips: [], createdAt: 1
		}, []);
		expect(readProject(handle)?.name).toBe('Old group');
	});

	it('syncs a group with a current secret', () => {
		stored('current-1', currentSecret);
		const handle = openRoom('current-1');
		expect(handle.legacy).toBe(false);
		expect(createSyncProvider).toHaveBeenCalledTimes(1);
	});
});
```

`src/lib/sync/describe.test.ts`, add:

```ts
	it('marks an old-format group as not syncing, without a banner or retry', () => {
		const view = describeSync(LOCAL_STATUS, null, NOW, { legacy: true });
		expect(view).toMatchObject({ state: 'legacy', label: 'Not syncing', banner: null, retry: false, attention: true });
	});
```

- [ ] **Step 6: Run to verify they fail**

Run: `npx vitest run src/lib/sync/doc.legacy.test.ts src/lib/sync/describe.test.ts`
Expected: FAIL (`legacy` is undefined, a provider is created for the legacy group, `state` is `local`). If the mocks do not line up with what `doc.ts` imports, `vi.mock` factories need the missing names; `doc.ts` uses only `RoomPersistence` from `./persistence`, `createSyncProvider` from `./provider` and `findProject`, `getCurrentMember` from `$lib/storage`.

- [ ] **Step 7: Implement**

`src/lib/sync/doc.ts`:
- Imports: `import { isLegacySecret } from '$lib/legacy';` and `import { isValidSecret } from '$lib/token';`.
- Above `RoomHandle`: `export const DEMO_ROOM_ID = 'DEMO';` and add `legacy: boolean;` to `RoomHandle` (with the comment `/** Made before v3: readable and exportable here, never synced. */`).
- Add next to `secretFromStorage`:

```ts
/** Only a current-format secret may reach the sync server; old groups stay local. */
function syncSecret(secret: string | undefined): string | undefined {
	return secret && isValidSecret(secret) ? secret : undefined;
}
```

- In the cached branch use `const effectiveSecret = syncSecret(secret ?? secretFromStorage(roomId));` (the rest of the branch is unchanged). In the creation path replace the `if (browser) { const effectiveSecret = ...` block with:

```ts
	const known = secret ?? secretFromStorage(roomId);
	const effectiveSecret = syncSecret(known);
	let syncProvider: EncryptedSyncProvider | undefined;
	if (browser && effectiveSecret) {
		syncProvider = createSyncProvider(doc, syncUrl(), effectiveSecret, persistence) ?? undefined;
	}
```

set `legacy: known !== undefined && isLegacySecret(known),` in the handle, and `cache.set(roomId, { handle, persistence, secret: effectiveSecret });`.

`src/lib/demo.ts`: delete `const DEMO_ROOM_ID = 'DEMO';` and change `import { openRoom } from './sync/doc';` to `import { DEMO_ROOM_ID, openRoom } from './sync/doc';`.

Three tests build `RoomHandle` literals (`activity-log.test.ts`, `expense-conflicts.test.ts`, `split-default-sync.test.ts`); add `legacy: false` to each so `npm run check` stays clean.

`src/lib/sync/describe.ts`: widen `options` to `{ demo?: boolean; legacy?: boolean }` and add, directly after the `local?.phase === 'error'` block:

```ts
	if (options.legacy) {
		return {
			...base, tone: 'warn', state: 'legacy', label: 'Not syncing', attention: true, facts: [],
			headline: 'This group no longer syncs',
			body: 'It was made with an older version of Kostos and stays readable here. Export a backup and restore it as a new group to keep syncing.'
		};
	}
```

`src/lib/sync/useRoom.svelte.ts`: import `describeSync, type SyncView` from `./describe` and `DEMO_ROOM_ID` from `./doc`, and add to `RoomState`:

```ts
	syncView(now: number): SyncView {
		return describeSync(this.sync, this.local, now, { demo: this.handle.roomId === DEMO_ROOM_ID, legacy: this.handle.legacy });
	}
```

`SyncStatus.svelte` line 21 becomes `const view = $derived(room ? room.syncView(now) : null);` and `SyncBanner.svelte` line 15 becomes `const view = $derived(room ? room.syncView(0) : null);`; delete their now-unused `describeSync` imports.

- [ ] **Step 8: Run to verify they pass**

Run: `npx vitest run src/lib && npm run check`
Expected: PASS, no errors.

**3c. The banner and the home marker.**

- [ ] **Step 9: Banner**

Create `src/lib/components/LegacyGroupBanner.svelte`:

```svelte
<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}
</script>

{#if room?.handle.legacy}
	<section class="legacy" data-legacy-banner role="status">
		<p class="lead">This group no longer syncs.</p>
		<p class="body">
			It was made with an older version of Kostos, so it can’t reach the sync server any more. Everything stays readable here.
			To keep syncing, export a backup and restore it as a new group, then share the new invite link. One person per group does this.
			A restore keeps members, categories, payment methods, trips and expenses. It drops the activity log and conflict history,
			and you pick who you are again.
		</p>
		<div class="actions">
			<button type="button" class="btn btn-primary" onclick={exportBackup} disabled={!room.project}>Export backup</button>
			<a class="btn" href="/restore">Restore as a new group</a>
		</div>
	</section>
{/if}

<style>
	.legacy {
		margin: 0 22px 10px; padding: 12px; border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4;
	}
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body { margin: 0 0 10px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
```

In `ProjectAppBar.svelte` add `import LegacyGroupBanner from './LegacyGroupBanner.svelte';` and render `<LegacyGroupBanner />` on the line after `<SyncBanner conflicts />`.

- [ ] **Step 10: Home list marker**

In `src/routes/+page.svelte` add `import { isLegacySecret } from '$lib/legacy';` and replace the `project-meta` span content (around line 211):

```svelte
								<span class="dim project-meta">
									{#if isLegacySecret(p.secret)}Old format, no longer syncs{:else}{p.lastSyncedAt ? `Synced ${relativeTime(p.lastSyncedAt, Date.now())}` : 'Not synced yet'}{/if}{#if p.lastActiveAt}<span class="meta-sep">·</span>{relativeDay(p.lastActiveAt)}{/if}
								</span>
```

- [ ] **Step 11: Verify and commit**

Run: `npm run check && npm test`
Expected: PASS. The browser behavior (no socket, banner, export, home marker) is covered by an e2e test in Task 10.

```bash
git add src
git commit -m "feat: keep old-format groups readable and offer export and restore instead of sync"
```

---

### Task 8: Worker and Durable Object enforce room access and the storage cap

**Files:**
- Modify: `src/lib/sync/relay-protocol.js` (add `MAX_ROOM_BYTES`)
- Modify: `worker/index.ts` (the header comment and the `/sync/` block)
- Modify: `src/lib/server/sync-do.ts` (imports, constructor tables, `fetch`, the write path)
- Modify: `scripts/worker-relay.test.ts`

**Interfaces:**
- Consumes: `parseRoomId`, `parseProofProtocol`, `proofHash`, `hashesEqual`, `DENIED_MESSAGE`, `DENIED_CLOSE_CODE` (Task 1).
- Produces: `/sync/<64 hex>` answers 400 for a bad room, 401 for a missing or malformed proof, and 101 with `Sec-WebSocket-Protocol` echoed otherwise. A foreign proof receives `{"type":"denied"}` and a 1008 close, and its messages are ignored. `MAX_ROOM_BYTES = 32 * 1024 * 1024`.

Facts checked against the repo and Miniflare 4.20260520.0:
- Claims go in a new `room_auth` table. `sync_meta.value` is declared `INTEGER NOT NULL` (constructor, `sync-do.ts` line 24), so it cannot hold a hash.
- A denied socket must not be `acceptWebSocket`ed: hibernating sockets would reach `webSocketMessage` and could write. It is `accept()`ed instead, which attaches no handlers, so anything it sends is dropped. Both paths (hibernating `acceptWebSocket` for admitted sockets, `accept()` for the denied one, echoed `Sec-WebSocket-Protocol`, `{"type":"denied"}` then close 1008) were exercised in a scratch Miniflare script and behave as described.
- `ctx.storage.sql.databaseSize` is typed in `@cloudflare/workers-types` and grows with inserts in Miniflare (about 1.05 MiB per 1 MiB blob), so the cap needs no running byte counter and no per-write `SUM()` scan (which would bill every row read).

- [ ] **Step 1: Adapt the Miniflare tests and add the new ones**

In `scripts/worker-relay.test.ts`:

1. Imports: `import { createHash, randomBytes } from 'node:crypto';` and `import { MAX_MESSAGE_BYTES } from '../src/lib/sync/relay-protocol.js';`.
2. Helpers below the imports:

```ts
const PROOF = 'P'.repeat(43);
const room = (name: string) => createHash('sha256').update(name).digest('hex');
```

3. Seed with hashed names (the legacy script keys Durable Objects by the last path segment, which is now the hex name):

```ts
	await mf.dispatchFetch(`http://local/sync/${room('small')}?count=3`);
	await mf.dispatchFetch(`http://local/sync/${room('capped')}?count=1000`);
```

4. Replace `connect` and add `open`. `open` returns as soon as the socket is open, with the close listener attached up front so no close event can be missed; `connect` additionally waits for `ready`:

```ts
async function open(name: string, proof = PROOF) {
	const url = await mf.ready;
	const ws = new WebSocket(`ws://${url.host}/sync/${room(name)}`, [`kostos1.${proof}`]); clients.push(ws);
	const binary: Buffer[] = [];
	const controls: Record<string, unknown>[] = [];
	const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
	ws.on('message', (data, isBinary) => { if (isBinary) binary.push(Buffer.from(data as Buffer)); else controls.push(JSON.parse(data.toString())); });
	await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
	return { ws, binary, controls, closed };
}
async function connect(name: string, proof = PROOF) {
	const peer = await open(name, proof);
	await until(() => peer.controls.some((m) => m.type === 'ready'));
	return peer;
}
```

5. Lowercase every room name passed to `connect(...)`:

```bash
sed -i "s/connect('SMALL')/connect('small')/g; s/connect('CAPPED')/connect('capped')/g; s/connect('LIVE')/connect('live')/g; s/connect('COMPACT')/connect('compact')/g" scripts/worker-relay.test.ts
```

6. Add at the end of the file:

```ts
describe('room access', () => {
	const upgrade = { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `kostos1.${PROOF}` };
	const packet = (seed: number) => { const out = Buffer.alloc(45); out.set([75, 79, 83, 51, 1]); out.writeUInt32BE(seed, 8); return out; };

	it('answers 400 for a relay room ID that is not 64 lowercase hex, before any Durable Object runs', async () => {
		for (const bad of ['SMALL', 'PRT-AAAA-BBBB', room('x').toUpperCase(), room('x').slice(1), `${room('x')}0`, '%2F']) {
			const response = await mf.dispatchFetch(`http://local/sync/${bad}`, { headers: upgrade });
			expect(response.status, bad).toBe(400);
		}
	});

	it('answers 401 when no proof, or a malformed one, is offered', async () => {
		const bare = await mf.dispatchFetch(`http://local/sync/${room('open')}`, { headers: { Upgrade: 'websocket' } });
		expect(bare.status).toBe(401);
		const malformed = await mf.dispatchFetch(`http://local/sync/${room('open')}`, { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'kostos1.short' } });
		expect(malformed.status).toBe(401);
	});

	it('echoes the proof subprotocol so browsers accept the upgrade', async () => {
		const owner = await connect('echo');
		expect(owner.ws.protocol).toBe(`kostos1.${PROOF}`);
	});

	it('tells a different proof it was denied, closes it with 1008 and ignores what it sends', async () => {
		const owner = await connect('claimed');
		owner.ws.send(packet(1)); owner.ws.send(JSON.stringify({ type: 'barrier', id: 'a' }));
		await until(() => owner.controls.some((m) => m.type === 'caught-up'));
		const intruder = await open('claimed', 'Q'.repeat(43));
		intruder.ws.send(packet(2));
		await until(() => intruder.controls.length > 0);
		expect(intruder.controls).toEqual([{ type: 'denied' }]);
		expect(intruder.ws.protocol).toBe(`kostos1.${'Q'.repeat(43)}`);
		expect(await intruder.closed).toBe(1008);
		expect(intruder.binary).toHaveLength(0);
		const reader = await connect('claimed');
		expect(reader.binary).toHaveLength(1);
		expect(reader.controls.at(-1)).toMatchObject({ type: 'ready', revision: 1 });
	});

	it('keeps the claim across a cold restart', async () => {
		await connect('restart');
		for (const client of clients.splice(0)) client.terminate();
		await mf.dispose(); mf = new Miniflare({ ...options(), script }); await mf.ready;
		const intruder = await open('restart', 'Q'.repeat(43));
		await until(() => intruder.controls.length > 0);
		expect(intruder.controls[0]).toEqual({ type: 'denied' });
		await connect('restart');
	});

	it('gives an unclaimed room to exactly one of two simultaneous first connections', async () => {
		const peers = await Promise.all([open('race', 'A'.repeat(43)), open('race', 'B'.repeat(43))]);
		await until(() => peers.every((peer) => peer.controls.length > 0));
		expect(peers.map((peer) => peer.controls[0].type).sort()).toEqual(['denied', 'ready']);
	});

	it('refuses writes past the room storage cap with the storage error and keeps what was acknowledged', async () => {
		const full = await connect('full');
		const large = () => Buffer.concat([Buffer.from([75, 79, 83, 51, 1]), randomBytes(MAX_MESSAGE_BYTES - 5)]);
		let acknowledged = 0;
		let refusal: Record<string, unknown> | undefined;
		for (let i = 0; i < 40 && !refusal; i++) {
			full.ws.send(large());
			await until(() => full.controls.some((m) => m.type === 'ack' && m.revision === acknowledged + 1) || full.controls.some((m) => m.type === 'error'));
			refusal = full.controls.find((m) => m.type === 'error');
			if (!refusal) acknowledged++;
		}
		expect(refusal).toEqual({ type: 'error', reason: 'storage' });
		expect(acknowledged).toBeGreaterThan(25);
		expect(acknowledged).toBeLessThanOrEqual(32);
		expect(await full.closed).toBe(1011);
		const again = await connect('full');
		expect(again.binary).toHaveLength(acknowledged);
	}, 60_000);
});
```

(The restart test runs after the earlier cold-restart test, which already re-creates `mf` the same way.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/worker-relay.test.ts`
Expected: FAIL (bad rooms are not rejected, connections without proof succeed, no `denied`, no cap).

- [ ] **Step 3: Cap constant and Worker check**

`src/lib/sync/relay-protocol.js`, below `MAX_MESSAGE_BYTES`:

```js
/** Per-room storage ceiling. Past it a room refuses writes (the `storage` error) instead of dropping history. */
export const MAX_ROOM_BYTES = 32 * 1024 * 1024;
```

`worker/index.ts`: add `import { parseProofProtocol, parseRoomId } from '../src/lib/sync/room-access.js';`, change the header comment to `WebSocket sync hits /sync/<relay room ID> and gets routed to a SyncRoom DO instance.`, and replace the `/sync/` block after the Upgrade check:

```ts
			let rawRoomId = '';
			try {
				rawRoomId = decodeURIComponent(url.pathname.slice('/sync/'.length));
			} catch {
				return new Response('Bad room', { status: 400 });
			}
			const relayRoomId = parseRoomId(rawRoomId);
			if (!relayRoomId) return new Response('Bad room', { status: 400 });
			if (!parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'))) return new Response('Unauthorized', { status: 401 });
			return env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(relayRoomId)).fetch(request);
```

- [ ] **Step 4: Durable Object**

`src/lib/server/sync-do.ts`:

- Imports:

```ts
import { MAX_ROOM_BYTES, unwrapPacket, payloadHash } from '../sync/relay-protocol.js';
import { DENIED_CLOSE_CODE, DENIED_MESSAGE, hashesEqual, parseProofProtocol, proofHash } from '../sync/room-access.js';
```

- Constructor, next to the other `CREATE TABLE` lines:

```ts
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_auth (id INTEGER PRIMARY KEY CHECK (id = 1), proof_hash TEXT NOT NULL)');
```

- Add before `fetch`:

```ts
	/** The first proof to connect claims the room (the primary key makes a second claim impossible);
	 *  every later connection must present the same one. Synchronous, so it needs no await inside serialized(). */
	private admit(hash: string): boolean {
		const sql = this.ctx.storage.sql;
		sql.exec('INSERT OR IGNORE INTO room_auth (id, proof_hash) VALUES (1, ?)', hash);
		return hashesEqual(sql.exec<{ proof_hash: string }>('SELECT proof_hash FROM room_auth WHERE id = 1').one().proof_hash, hash);
	}
```

- `fetch` becomes:

```ts
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
		const offered = parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'));
		if (!offered) return new Response('Unauthorized', { status: 401 });
		const hash = await proofHash(offered.proof);
		await this.initialized;
		return this.serialized(async () => {
			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);
			const headers = { 'Sec-WebSocket-Protocol': offered.protocol };
			if (!this.admit(hash)) {
				// not hibernatable on purpose: this socket never joins the room, so no handler ever sees its messages
				server.accept();
				this.control(server, DENIED_MESSAGE);
				server.close(DENIED_CLOSE_CODE, 'Unauthorized');
				return new Response(null, { status: 101, webSocket: client, headers });
			}
			this.ctx.acceptWebSocket(server);
			try {
				for (const entry of this.ctx.storage.sql.exec<Entry>('SELECT seq, hash, payload FROM messages ORDER BY seq')) server.send(entry.payload);
				const complete = this.ctx.storage.sql.exec<{ value: number }>("SELECT value FROM sync_meta WHERE key = 'complete'").one().value === 1;
				this.control(server, { type: 'ready', protocol: 3, revision: this.revision(), durable: true, complete });
			} catch {
				server.close(1011, 'Could not replay sync history');
			}
			return new Response(null, { status: 101, webSocket: client, headers });
		});
	}
```

- In `webSocketMessage`, inside `if (revision === undefined) {`, before the insert:

```ts
					// database size, not a SUM over rows: it is O(1), and every row read is billed
					if (this.ctx.storage.sql.databaseSize + payload.byteLength > MAX_ROOM_BYTES) {
						this.control(ws, { type: 'error', reason: 'storage' });
						ws.close(1011, 'Room storage limit reached');
						return;
					}
```

(a write that is already stored still gets its acknowledgement: the cap check is inside the "not stored yet" branch).

- [ ] **Step 5: Run to verify**

Run: `npx vitest run scripts/worker-relay.test.ts`
Expected: PASS, including the legacy-KV migration tests. If the cap test accepts more than 32 or fewer than 26 writes, `databaseSize` accounting differs from the scratch measurement; report the number rather than loosening the bounds blindly.
Run: `npm run check`
Expected: no errors in `worker/` or `src/lib/server/`.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts src/lib/server/sync-do.ts src/lib/sync/relay-protocol.js scripts/worker-relay.test.ts
git commit -m "feat(sync): require the room proof and cap room storage on the worker and durable object"
```

---

### Task 9: Node relays and the Docker image

**Files:**
- Rewrite: `scripts/relay.js`
- Modify: `scripts/serve.js` (header comment, imports, upgrade handler lines 108 to 141, listen log line)
- Modify: `scripts/sync-server.js`
- Modify: `scripts/durable-relay.test.ts`, `scripts/relays.test.ts`, `scripts/serve-shutdown.test.ts`
- Modify: `Dockerfile`, `.github/workflows/docker.yml`

**Interfaces:**
- Consumes: Task 1 exports, `MAX_ROOM_BYTES` (Task 8).
- Produces: `createRelay(directory)` returns `attach(ws, id: string, proof: string)` with `attach.drain()` unchanged. A room's claim lives in `<sha256(id)>.auth` beside `<sha256(id)>.jsonl`.

Notes that shape the code:
- `serve.js` already handles SIGTERM (v2.10.1: close clients, `attachRelay.drain()`, exit). Do not touch that block; the new work runs inside the same per-room queue, so `drain()` still waits for it.
- The `.auth` claim is written to a temp file, fsynced, then renamed into place, so a crash can never leave a half-written file under the real name. Claims are serialized per room inside one relay process, which is the supported setup (one process per data directory), so no exclusive create is needed and it works on every filesystem. A file that is not exactly 64 lowercase hex is a hard error, never "unclaimed".
- Admission is a per-socket `admitted` flag in the `attach` closure, not membership of `room.sockets`: a socket that sends an update and closes straight away is removed from `sockets` by its `close` handler before the queued write runs, and must still have the write stored. Auth runs before the "socket still open" check for the same reason.
- `ws` picks the first offered subprotocol when no `handleProtocols` is set, and the client offers exactly one, so the upgrade echoes the proof protocol and browsers accept it.
- The Docker runtime stage copies only listed files. `relay.js` now imports `room-access.js`, which imports `relay-protocol.js` (already copied). `room-access.js` has no other imports.

- [ ] **Step 1: Adapt and extend the tests**

`scripts/durable-relay.test.ts`:

- Imports: `import { createHash, randomBytes } from 'node:crypto';`, `import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';` (replacing the existing `fs/promises` import), `import { MAX_MESSAGE_BYTES, payloadHash } from '../src/lib/sync/relay-protocol.js';` and `import { parseProofProtocol } from '../src/lib/sync/room-access.js';`.
- Constants and routing helper below the imports:

```ts
const ROOM = 'a'.repeat(64);
const PROOF = 'P'.repeat(43);
const proofOf = (request: { headers: Record<string, string | string[] | undefined> }) =>
	parseProofProtocol(request.headers['sec-websocket-protocol'] as string | undefined)?.proof ?? '';
```

- In `start`: `server.on('connection', (ws, request) => attach(ws, ROOM, proofOf(request)));`. In the `drain` test the custom handler becomes `server.on('connection', (ws, request) => { attach(ws, ROOM, proofOf(request)); ws.on('message', (_data, binary) => { if (binary) received++; }); });`.
- Replace `connect` so the close listener exists from the start and `closed` can be awaited without a race:

```ts
async function connect(url: string, proof = PROOF) {
	const ws = new WebSocket(url, [`kostos1.${proof}`]); sockets.push(ws);
	const binary: Buffer[] = [];
	const controls: Record<string, unknown>[] = [];
	const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
	ws.on('message', (data, isBinary) => { if (isBinary) binary.push(Buffer.from(data as Buffer)); else controls.push(JSON.parse(data.toString())); });
	await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
	return { ws, binary, controls, closed };
}
```

- Add inside `describe('durable encrypted relay', ...)`:

```ts
	it('lets the first proof claim the room and tells any other proof it was denied', async () => {
		const url = await start(); const owner = await connect(url);
		await until(() => owner.controls.some((m) => m.type === 'ready'));
		const intruder = await connect(url, 'Q'.repeat(43));
		expect(await intruder.closed).toBe(1008);
		expect(intruder.controls).toEqual([{ type: 'denied' }]);
		expect(intruder.binary).toHaveLength(0);
	});
	it('ignores updates from a socket that was denied', async () => {
		const url = await start(); const owner = await connect(url);
		await until(() => owner.controls.some((m) => m.type === 'ready'));
		const intruder = await connect(url, 'Q'.repeat(43));
		intruder.ws.send(packet(7));
		await intruder.closed;
		const reader = await connect(url);
		await until(() => reader.controls.some((m) => m.type === 'ready'));
		expect(reader.binary).toHaveLength(0);
	});
	it('remembers the claim across a restart', async () => {
		const url = await start(); const owner = await connect(url);
		await until(() => owner.controls.some((m) => m.type === 'ready'));
		await stop();
		const restarted = await start(directory);
		const intruder = await connect(restarted, 'Q'.repeat(43));
		expect(await intruder.closed).toBe(1008);
		const again = await connect(restarted);
		await until(() => again.controls.some((m) => m.type === 'ready'));
	});
	it('gives an unclaimed room to exactly one of two simultaneous first connections', async () => {
		const url = await start();
		const peers = await Promise.all([connect(url, 'A'.repeat(43)), connect(url, 'B'.repeat(43))]);
		await until(() => peers.every((peer) => peer.controls.length > 0));
		expect(peers.map((peer) => peer.controls[0].type).sort()).toEqual(['denied', 'ready']);
	});
	it('treats a torn claim file as an error, never as an unclaimed room', async () => {
		const url = await start();
		const stem = createHash('sha256').update(ROOM).digest('hex');
		await mkdir(directory, { recursive: true });
		await writeFile(`${directory}/${stem}.auth`, 'half-writ');
		const peer = await connect(url);
		expect(await peer.closed).toBe(1011);
		expect(peer.controls).toEqual([{ type: 'error', reason: 'storage' }]);
	});
	it('keeps an update from a socket that closes straight after sending it', async () => {
		const url = await start(); const sender = await connect(url);
		await until(() => sender.controls.some((m) => m.type === 'ready'));
		for (let i = 0; i < 20; i++) sender.ws.send(packet(i));
		sender.ws.close();
		await sender.closed;
		const receiver = await connect(url);
		await until(() => receiver.controls.some((m) => m.type === 'ready'));
		expect(receiver.binary).toHaveLength(20);
	});
	it('refuses writes past the room storage cap and keeps what was acknowledged', async () => {
		const url = await start(); const sender = await connect(url);
		await until(() => sender.controls.some((m) => m.type === 'ready'));
		const large = () => Buffer.concat([Buffer.from([75, 79, 83, 51, 1]), randomBytes(MAX_MESSAGE_BYTES - 5)]);
		let acknowledged = 0;
		for (let i = 0; i < 40 && !sender.controls.some((m) => m.type === 'error'); i++) {
			sender.ws.send(large());
			await until(() => sender.controls.some((m) => m.type === 'ack' && m.revision === acknowledged + 1) || sender.controls.some((m) => m.type === 'error'));
			if (!sender.controls.some((m) => m.type === 'error')) acknowledged++;
		}
		expect(sender.controls.at(-1)).toEqual({ type: 'error', reason: 'storage' });
		expect(acknowledged).toBe(32);
		expect(await sender.closed).toBe(1011);
		const reader = await connect(url);
		await until(() => reader.controls.some((m) => m.type === 'ready'));
		expect(reader.binary).toHaveLength(32);
	}, 60_000);
```

The "keeps an update from a socket that closes" test passes against the old relay too; it exists to pin the behavior the `admitted` flag must preserve. It sends 20 updates so most of them are still queued when the `close` event fires; with a single update the write runs before `close` and the test cannot tell the flag from socket-set membership. The others fail first. Also update the two other `attach(ws, 'ROOM')` mentions if any remain (`rg -n "'ROOM'" scripts`).

`scripts/relays.test.ts`:

- Constants: `const ROOM = 'a'.repeat(64);`, `const PROOF = 'P'.repeat(43);`, `const PROOF_PROTOCOL = `kostos1.${PROOF}`;`. Split the headers so one probe can omit the proof:

```ts
const UPGRADE_BASE =
	'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
	'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n';
const UPGRADE_HEADERS = `${UPGRADE_BASE}Sec-WebSocket-Protocol: ${PROOF_PROTOCOL}\r\n\r\n`;
const UPGRADE_WITHOUT_PROOF = `${UPGRADE_BASE}\r\n`;
```

- `sendBadFrame(port, path, headers = UPGRADE_HEADERS)`: take the headers as a third parameter and write `GET ${path} HTTP/1.1\r\n${headers}` in place of the constant.
- `pingPong`: `new WebSocket(`ws://127.0.0.1:${port}/sync/${ROOM}`, [PROOF_PROTOCOL])`.
- Each relay gets its own data directory, because admitting a socket now writes a `.auth` file and the default directory (`.kostos-data/serve`) is in the working tree. Imports: `import { mkdtemp, rm } from 'node:fs/promises';`, `import { tmpdir } from 'node:os';`, `import { join } from 'node:path';`. Change `startRelay` and add `stopRelay`:

```ts
type Relay = { child: ChildProcess; stderr: () => string; dataDirectory: string };

async function startRelay(script: string, port: number): Promise<Relay> {
	const dataDirectory = await mkdtemp(join(tmpdir(), 'kostos-relay-test-'));
	const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
		env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', KOSTOS_DATA_DIR: dataDirectory },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	let stderr = '';
	child.stderr!.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
	const relay = { child, stderr: () => stderr, dataDirectory };

	return new Promise((resolve, reject) => {
		// body unchanged from the current file
	});
}

async function stopRelay(relay: Relay | undefined) {
	relay?.child.kill();
	if (relay) await rm(relay.dataDirectory, { recursive: true, force: true });
}
```

  and make every `afterAll` call it: `afterAll(() => stopRelay(relay));` (two places: the per-relay `describe` and `serve.js http`).
- Add two helpers next to `pingPong`:

```ts
async function until(check: () => boolean) {
	const deadline = Date.now() + STEP_TIMEOUT_MS;
	while (!check()) {
		if (Date.now() > deadline) throw new Error('Relay did not respond');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function dial(port: number, proof: string) {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/sync/${ROOM}`, [`kostos1.${proof}`]);
	const controls: Record<string, unknown>[] = [];
	const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
	ws.on('message', (data, binary) => { if (!binary && data.toString() !== 'pong') controls.push(JSON.parse(data.toString())); });
	ws.on('error', () => {});
	return { ws, controls, closed };
}
```

- Extend the `relays` table and its loop (`for (const { script, port, probes, withoutProof } of relays)`):

```ts
const relays: { script: string; port: number; probes: Record<string, Probe>; withoutProof: Probe }[] = [
	{
		script: './serve.js',
		port: 18_731,
		// serve.js drops bad room ids, non-sync paths and requests without a proof before upgrading
		probes: { [`/sync/${ROOM}`]: 'upgraded', '/sync/PRT-AAAA-BBBB': 'rejected', '/sync/%ZZ': 'rejected', '/not-sync': 'rejected' },
		withoutProof: 'rejected'
	},
	{
		script: './sync-server.js',
		port: 18_732,
		// the dev relay upgrades everything, then closes sockets with no usable room or proof
		probes: { [`/sync/${ROOM}`]: 'upgraded', '/sync/%ZZ': 'upgraded', '/': 'upgraded' },
		withoutProof: 'upgraded'
	}
];
```

and inside the per-relay `describe`:

```ts
		it('handles a request without a proof as the relay promises', async () => {
			expect(await sendBadFrame(port, `/sync/${ROOM}`, UPGRADE_WITHOUT_PROOF)).toBe(withoutProof);
			expect(await pingPong(port)).toBe('pong');
		});
		it('tells a client with the wrong proof it was denied, then closes it', async () => {
			const owner = await dial(port, PROOF);
			await until(() => owner.controls.length > 0);
			const intruder = await dial(port, 'Q'.repeat(43));
			expect(await intruder.closed).toBe(1008);
			expect(intruder.controls).toEqual([{ type: 'denied' }]);
			owner.ws.terminate();
		});
```

(`dial` does not wait for the open, so `owner.controls` fills when the `ready` message arrives.)

`scripts/serve-shutdown.test.ts`: the room is now validated, so the connection line becomes `const ws = new WebSocket(`ws://127.0.0.1:18762/sync/${'b'.repeat(64)}`, [`kostos1.${'P'.repeat(43)}`]);`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/durable-relay.test.ts scripts/relays.test.ts scripts/serve-shutdown.test.ts`
Expected: FAIL (`attach` ignores the proof, `/sync/PRT-AAAA-BBBB` still upgrades on serve.js, no `.auth` handling).

- [ ] **Step 3: Implement `scripts/relay.js`**

Replace the file with:

```js
/* Shared Node relay: complete append-only encrypted history, serialized room
 * operations, and acknowledgements after fsync. KOSTOS_DATA_DIR should be on a
 * persistent volume in Docker. Nothing is ever trimmed; a room that reaches
 * MAX_ROOM_BYTES refuses further writes instead. The first proof to connect
 * claims a room, and the claim lives next to its log in <room hash>.auth.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAX_ROOM_BYTES, unwrapPacket, payloadHash } from '../src/lib/sync/relay-protocol.js';
import { DENIED_CLOSE_CODE, DENIED_MESSAGE, hashesEqual, isProofHash, proofHash } from '../src/lib/sync/room-access.js';

/** null only when nobody has claimed the room; a damaged file throws.
 *  @param {string} file @returns {Promise<string | null>} */
async function readClaim(file) {
	let contents;
	try { contents = await readFile(file, 'utf8'); }
	catch (error) {
		if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
		throw error;
	}
	if (!isProofHash(contents)) throw new Error(`Damaged room claim: ${file}`);
	return contents;
}

/** Writes the claim under a temporary name, then renames it into place, so a crash can't leave a
 *  half-written real file. Callers are serialized per room, so no second claim races this one.
 *  @param {string} file @param {string} hash @returns {Promise<string>} the hash that owns the room */
async function claimRoom(file, hash) {
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		const handle = await open(temporary, 'wx');
		try { await handle.writeFile(hash); await handle.sync(); } finally { await handle.close(); }
		await rename(temporary, file);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
	return hash;
}

/** @param {string} directory */
export function createRelay(directory) {
	/** @type {Map<string, ReturnType<typeof makeRoom>>} */
	const rooms = new Map();
	/** @param {string} id */
	function makeRoom(id) {
		const stem = resolve(directory, createHash('sha256').update(id).digest('hex'));
		const room = {
			/** @type {Set<import('ws').WebSocket>} */ sockets: new Set(),
			/** @type {{hash: string, payload: Buffer}[]} */ history: [],
			/** @type {Map<string, number>} */ hashes: new Map(),
			tail: Promise.resolve(),
			file: `${stem}.jsonl`,
			authFile: `${stem}.auth`,
			/** @type {string | null} */ authHash: null,
			bytes: 0,
			loaded: false
		};
		return room;
	}
	/** @param {import('ws').WebSocket} ws @param {object} message */
	function control(ws, message) {
		try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); }
		catch { ws.terminate(); }
	}
	/** @param {ReturnType<typeof makeRoom>} room */
	async function load(room) {
		if (room.loaded) return;
		await mkdir(directory, { recursive: true });
		let contents = '';
		try { contents = await readFile(room.file, 'utf8'); }
		catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error; }
		// Never acknowledge a room whose disk history is corrupt or incomplete.
		// An interrupted final append is reported rather than silently discarded.
		/** @type {{hash: string, payload: Buffer}[]} */
		const history = [];
		const hashes = new Map();
		for (const line of contents.split('\n').filter(Boolean)) {
			const entry = JSON.parse(line);
			const payload = Buffer.from(entry.data, 'base64');
			if (await payloadHash(payload) !== entry.hash) throw new Error('Corrupt sync history');
			history.push({ hash: entry.hash, payload });
			hashes.set(entry.hash, history.length);
		}
		const authHash = await readClaim(room.authFile);
		room.history = history;
		room.hashes = hashes;
		room.authHash = authHash;
		room.bytes = history.reduce((total, entry) => total + entry.payload.length, 0);
		room.loaded = true;
	}
	/** @param {ReturnType<typeof makeRoom>} room @param {import('ws').WebSocket} ws @param {() => Promise<void>} work */
	function enqueue(room, ws, work) {
		room.tail = room.tail.then(async () => { await load(room); await work(); }).catch(() => {
			room.loaded = false;
			control(ws, { type: 'error', reason: 'storage' });
			ws.close(1011, 'Could not persist sync data');
		});
	}
	/** The first proof to connect claims the room; every later connection must match it.
	 *  @param {ReturnType<typeof makeRoom>} room @param {string} proof */
	async function authorize(room, proof) {
		const hash = await proofHash(proof);
		room.authHash ??= await claimRoom(room.authFile, hash);
		return hashesEqual(room.authHash, hash);
	}
	/** @param {import('ws').WebSocket} ws @param {string} id @param {string} proof */
	function attach(ws, id, proof) {
		let room = rooms.get(id);
		if (!room) { room = makeRoom(id); rooms.set(id, room); }
		const activeRoom = room;
		// Set once the proof is accepted and kept after the socket closes, so a write sent just
		// before closing is still stored. Socket-set membership can't tell those cases apart.
		let admitted = false;
		ws.on('error', () => { activeRoom.sockets.delete(ws); ws.terminate(); });
		ws.on('close', () => activeRoom.sockets.delete(ws));
		enqueue(activeRoom, ws, async () => {
			if (!(await authorize(activeRoom, proof))) {
				control(ws, DENIED_MESSAGE);
				ws.close(DENIED_CLOSE_CODE, 'Unauthorized');
				return;
			}
			admitted = true;
			if (ws.readyState !== ws.OPEN) return;
			activeRoom.sockets.add(ws);
			for (const entry of activeRoom.history) ws.send(entry.payload);
			control(ws, { type: 'ready', protocol: 3, revision: activeRoom.history.length, durable: true, complete: true });
		});
		ws.on('message', (data, binary) => {
			if (!binary) {
				const text = data.toString();
				if (text === 'ping') { if (ws.readyState === ws.OPEN) ws.send('pong'); return; }
				let message;
				try { message = JSON.parse(text); } catch { return; }
				if (!message || typeof message !== 'object') return;
				if (message.type === 'barrier' && typeof message.id === 'string' && message.id.length <= 80) {
					enqueue(activeRoom, ws, async () => {
						if (!admitted) return;
						control(ws, { type: 'caught-up', id: message.id, revision: activeRoom.history.length });
					});
				}
				return;
			}
			enqueue(activeRoom, ws, async () => {
				if (!admitted) return;
				const packet = data instanceof Buffer ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
				let decoded;
				try { decoded = unwrapPacket(packet); }
				catch { control(ws, { type: 'error', reason: 'size' }); ws.close(1009, 'Invalid message size'); return; }
				// The disk log numbers revisions by position, so it can't splice in a snapshot. Ignore it.
				if (decoded.compact !== undefined) return;
				const payload = Buffer.from(decoded.payload);
				if (!decoded.durable) {
					for (const peer of activeRoom.sockets) {
						if (peer === ws || peer.readyState !== peer.OPEN) continue;
						try { peer.send(payload); } catch { peer.terminate(); }
					}
					return;
				}
				const hash = await payloadHash(payload);
				const existing = activeRoom.hashes.get(hash);
				if (existing) { control(ws, { type: 'ack', hash, revision: existing }); return; }
				if (activeRoom.bytes + payload.length > MAX_ROOM_BYTES) {
					control(ws, { type: 'error', reason: 'storage' });
					ws.close(1011, 'Room storage limit reached');
					return;
				}
				const file = await open(activeRoom.file, 'a');
				try {
					await file.writeFile(`${JSON.stringify({ hash, data: payload.toString('base64') })}\n`);
					await file.sync();
				} finally { await file.close(); }
				activeRoom.history.push({ hash, payload });
				activeRoom.bytes += payload.length;
				const revision = activeRoom.history.length;
				activeRoom.hashes.set(hash, revision);
				for (const peer of activeRoom.sockets) {
					if (peer === ws || peer.readyState !== peer.OPEN) continue;
					try { peer.send(payload); control(peer, { type: 'revision', revision }); }
					catch { peer.terminate(); }
				}
				control(ws, { type: 'ack', hash, revision });
			});
		});
	}
	// resolves once every room has finished the writes it already accepted
	attach.drain = () => Promise.all([...rooms.values()].map((room) => room.tail));
	return attach;
}
```

- [ ] **Step 4: Implement `serve.js` and `sync-server.js`**

`scripts/serve.js`: add `import { parseSyncRequest } from '../src/lib/sync/room-access.js';`; change the header comment and the final log line from `/sync/<roomId>` to `/sync/<relay room ID>`; replace the whole body of `server.on('upgrade', ...)` after the `socket.on('error', ...)` line (the URL parsing, the `match`, the `roomId` lines and the `handleUpgrade`) with:

```js
	const sync = parseSyncRequest(request.url, request.headers['sec-websocket-protocol']);
	if (!sync) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(request, socket, head, (ws) => {
		attachRelay(ws, sync.relayRoomId, sync.proof);
	});
```

`safeDecode` stays (still used by `safeJoin`). Leave the SIGTERM block exactly as it is.

`scripts/sync-server.js`: add the same import and replace the connection handler:

```js
wss.on('connection', (ws, req) => {
	ws.on('error', () => ws.terminate());
	const sync = parseSyncRequest(req.url, req.headers['sec-websocket-protocol']);
	if (!sync) { ws.close(1008, 'missing room'); return; }
	attachRelay(ws, sync.relayRoomId, sync.proof);
});
```

- [ ] **Step 5: Run to verify**

Run: `npx vitest run scripts`
Expected: PASS (all relay test files, including `serve-shutdown`). The `drain` test confirms `attachRelay.drain()` still waits for queued work, now including auth.

- [ ] **Step 6: Docker image**

`Dockerfile`: add after the `relay-protocol.js` copy line:

```dockerfile
COPY --from=builder /app/src/lib/sync/room-access.js ./src/lib/sync/room-access.js
```

`.github/workflows/docker.yml`: insert after the "Set up Buildx" step and before "Log in to GHCR" so a missing `COPY` fails the release before anything is pushed:

```yaml
      - name: Build image for a smoke test
        uses: docker/build-push-action@v7
        with:
          context: .
          load: true
          tags: kostos:smoke
          cache-from: type=gha

      - name: Check the container starts
        run: |
          docker run -d --name kostos-smoke -p 8080:8080 kostos:smoke
          for attempt in $(seq 1 20); do
            curl -fsS http://127.0.0.1:8080/healthz && exit 0
            sleep 1
          done
          docker logs kostos-smoke
          exit 1
```

(The first run happens at the next release or manual dispatch; check it there.)

Local check of the same thing, which also exercises a claim end to end:

```bash
docker build -t kostos:smoke --build-arg PUBLIC_APP_VERSION=3.0.0-smoke .
docker run -d --rm --name kostos-smoke -p 18080:8080 kostos:smoke
sleep 3 && curl -fsS http://127.0.0.1:18080/healthz
node --input-type=module -e "
import WebSocket from 'ws';
const room = 'a'.repeat(64);
const first = (proof) => new Promise((resolve, reject) => {
	const ws = new WebSocket('ws://127.0.0.1:18080/sync/' + room, ['kostos1.' + proof]);
	ws.on('message', (data, binary) => { if (!binary) { resolve(JSON.parse(data.toString()).type); ws.close(); } });
	ws.on('error', reject);
});
console.log(await first('P'.repeat(43)), await first('Q'.repeat(43)));
"
docker logs kostos-smoke | tail -5
docker stop kostos-smoke
```

Expected: `ok`, then `ready denied`, a log containing `listening on`, and `docker stop` returning within a second or two (SIGTERM handling). Without the new `COPY` line the container exits at startup with `ERR_MODULE_NOT_FOUND` for `room-access.js`; check that failure once by commenting the line out if you want proof the step catches it. Run the node snippet from the repo root so `ws` resolves.

- [ ] **Step 7: Commit**

```bash
git add scripts Dockerfile .github/workflows/docker.yml
git commit -m "feat(sync): require the room proof, claim rooms atomically and cap storage on the node relays"
```

---

### Task 10: e2e, deploy config and docs

**Files:**
- Modify: `e2e/sync.e2e.ts`, `scripts/screenshots.js`
- Modify: `wrangler.toml`, `.github/workflows/release.yml`
- Modify: `package.json`, `package-lock.json`
- Modify: `README.md`
- Create: `docs/migration/rollout-checklist.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a branch that deploys as its own Worker (`kostos-app`, new Durable Object namespace) and leaves the `kostos` Worker on the old domain untouched.

- [ ] **Step 1: Update and extend the e2e flow**

In `e2e/sync.e2e.ts`:

- Add near the top: `const LOCAL_ID = /\/p\/[0-9a-f]{32}/;` and `const LEGACY_SECRET = Buffer.alloc(32, 2).toString('base64url'); // 43 characters, what v2 generated`.
- `seed()` and `join()`: `await page.waitForURL(LOCAL_ID);` (was `/\/p\/PRT-/`). `join()` goes to `${BASE}/join#${ref.secret}`.
- `scripts/screenshots.js` line 227 has the same `waitForURL(/\/p\/PRT-/)` after its restore step; change it to `/\/p\/[0-9a-f]{32}/`. (The script needs a running dev server and is not part of `npm test`, so nothing else would catch it.)
- Wrong-key scenario (line 178): a wrong key now points at a different, empty room, so the join page reports the group as unavailable. Replace its goto and wait with:

```ts
		await b.goto(`${BASE}/join#${Buffer.alloc(16, 9).toString('base64url')}`);
		await b.getByText('Group data isn’t available').waitFor();
```

- Extract the seeding body of the test 'opens the existing y-indexeddb schema without resetting saved project data' (from `const roomId = ...` to the end of the `page.evaluate`) into a helper `async function storeGroup(page: Page, secret: string): Promise<string>` that returns the room ID (use `` `STORED-${crypto.randomUUID()}` `` so the local key is clearly not derived; the app does not care). The existing test calls it with `Buffer.alloc(16, 2).toString('base64url')` and keeps its assertions.
- Add these tests (selectors marked "check" were read from the sources but not run; adjust if a role name differs):

```ts
	it('opens an old-format group offline, never syncs it, and offers export and restore', async () => {
		const page = await phone();
		const sockets: string[] = [];
		page.on('websocket', (socket) => sockets.push(socket.url()));
		await page.goto(`${BASE}/`);
		const roomId = await storeGroup(page, LEGACY_SECRET);
		await page.goto(`${BASE}/`);
		await page.getByText('Old format, no longer syncs').waitFor();
		await page.goto(`${BASE}/p/${roomId}`);
		await page.waitForSelector('[data-legacy-banner]');
		await page.waitForSelector('[data-sync-state="legacy"]', { state: 'attached' });
		expect(await page.locator('.project-name').innerText()).toContain('Lisbon Crew');
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
		expect(download.suggestedFilename()).toMatch(/^kostos-lisbon-crew-\d{4}-\d{2}-\d{2}\.json$/);
		await page.goto(`${BASE}/p/${roomId}/expenses`);
		await page.getByText('Seafood dinner', { exact: true }).waitFor();
		expect(sockets.filter((url) => url.includes('/sync/'))).toEqual([]);
		await page.goto(`${BASE}/p/${roomId}`);
		await page.getByRole('link', { name: 'Restore as a new group' }).click();
		await page.waitForURL(`${BASE}/restore`);
	});
	it('shows an invite link that carries only the key', async () => {
		const page = await phone(); const ref = await seed(page);
		expect(ref.secret).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(ref.roomId).toMatch(/^[0-9a-f]{32}$/);
		await page.goto(`${BASE}/p/${ref.roomId}`); await synced(page);
		await page.getByRole('button', { name: 'Share invite' }).click();
		expect(await page.inputValue('#share-url-display')).toBe(`${BASE}/join#${ref.secret}`);
	});
	it('creates a group and lands on its local ID', async () => {
		const page = await phone(); await page.goto(`${BASE}/new`);
		await page.fill('input[placeholder="Group name"]', 'Weekend');
		await page.fill('input[placeholder="Your name"]', 'Anna');
		await page.getByRole('button', { name: 'Create', exact: true }).click(); // check: the header button and the form may both match
		await page.waitForURL(LOCAL_ID); await synced(page);
	});
	it('rejects old invites with a message that names the old site', async () => {
		const page = await phone();
		await page.goto(`${BASE}/join?room=PRT-AB23-CD45#${LEGACY_SECRET}`);
		await page.getByText('old Kostos site').waitFor();
		expect(page.url()).toContain('/join');
		await page.goto(`${BASE}/`);
		await page.getByRole('button', { name: 'Join a group' }).click();
		await page.fill('input[placeholder="Invite link or group key"]', LEGACY_SECRET);
		await page.getByRole('button', { name: 'Continue' }).click();
		await page.getByText('old Kostos site').waitFor();
	});
```

- [ ] **Step 2: Run e2e if a browser is available**

Run: `npm run build && npm run test:e2e`
Expected: PASS. If Chromium is not installed, set `PLAYWRIGHT_CHROMIUM_PATH` or say so in the final handoff; do not skip silently. The run rewrites the tracked `docs/screenshots/sync/*.png` (and leaves `debug-sync-failure.png` after a failure); run `git checkout docs/screenshots` and delete the debug file before committing.

- [ ] **Step 3: Deploy config for the second Worker**

`wrangler.toml` (verified with `wrangler deploy --dry-run` on wrangler 4.93.1 in a scratch directory: `workers_dev`, `preview_urls`, a placeholder custom domain and `invocation_logs` are all accepted):

```toml
name = "kostos-app"
main = "worker/index.ts"
compatibility_date = "2025-05-01"
compatibility_flags = ["nodejs_compat"]

# no second public origin: the Worker is reachable on APP_DOMAIN only
workers_dev = false
preview_urls = false

routes = [
	{ pattern = "APP_DOMAIN", custom_domain = true }
]
```

(a new Worker name means a new Durable Object namespace, so rooms start clean and `kostos` on the old domain keeps its data and protocol.) Leave `[assets]`, `[[durable_objects.bindings]]` and `[[migrations]]` as they are, and replace the observability block:

```toml
[observability]
enabled = true

# Workers Logs: see the note below
[observability.logs]
invocation_logs = false
```

`.github/workflows/release.yml`: `url: https://APP_DOMAIN`.

**Workers Logs and the proof.** Checked against Cloudflare's docs through Context7 on 2026-10-16: Workers Logs writes one invocation log per request that "contains details such as the Request, Response, and related metadata", and `invocation_logs = false` switches those logs off (wrangler's own schema describes the key as "Set to false to disable invocation logs"). The docs describe no per-header exclusion for Workers Logs. The only documented header redaction (names containing `auth`, `key`, `secret`, `token` or `jwt`, plus `cookie`) belongs to Tail Workers' `TailRequest`, and it would not match `Sec-WebSocket-Protocol`. So the setting above is the only documented way to keep the proof out of retained logs. The cost: no per-request logs in the dashboard (custom `console.*` output still works; the code has none). After the first deploy, open a test group, then confirm in the dashboard that no event for `/sync/` shows up and, if one does, that it carries no `kostos1.` value. Residual limitation to keep in the README: Cloudflare's edge and any Logpush job you add yourself sit outside this setting, and the relay room ID and proof reach the server by design.

Dry run (needs `build/`):

```bash
npm run build && npx wrangler deploy --dry-run --outdir /tmp/kostos-dry-run
```

Expected: exit 0, bindings list shows `env.SYNC_ROOM (SyncRoom)` and `env.ASSETS`. If wrangler rejects the `APP_DOMAIN` placeholder, put the real domain in for the dry run only and say so in the handoff.

- [ ] **Step 4: Version 3.0.0**

```bash
npm version 3.0.0 --no-git-tag-version --ignore-scripts
npm pkg set name=kostos
```

Then change `name` and `version` by hand in the two places they appear at the top of `package-lock.json` (the root and `packages[""]`). `npm install --package-lock-only` is not used because the local npm drops the `libc` fields from every platform package, which is unrelated churn.

The package name loses its stale `-v2` here (nothing else in the repo uses it).

Expected: `v3.0.0`, and `git diff --stat` shows `package.json` and `package-lock.json` only (two lines changed in each), with the name `kostos` and version `3.0.0` in both. `svelte.config.js` takes the shown app version from the release tag or `git describe` ("we never hand-bump it"), so `package.json` is just the fallback; publishing the GitHub release `v3.0.0` is what users see.

- [ ] **Step 5: README**

Line numbers are from the current file.

| Line | Change |
| --- | --- |
| 6 | Live demo link: `https://APP_DOMAIN` |
| 12 | `Create a group, share its invite link, log expenses, settle up. ... syncs live across every device that has the invite link, and stays readable offline once you've opened it.` |
| 16 | `- **No accounts.** A group is a secret key, and the invite link carries it. Share the link, anyone with it joins. The server never sees the key.` |
| 69 and 130 | `/sync/<roomId>` becomes `/sync/<relay room ID>` |
| 91 and 105 | image tag `:2` becomes `:3` |
| 108 | `:3` follows every 3.x release. `:3.0` only gets patch releases and `:3.0.0` never changes. |
| 136 | `... Only devices with the group's invite link can decrypt them.` |
| 139 | `- **Link-based, not session-based.** v1 used localStorage to remember "who you are" per browser. v2 makes the invite link the identity: the same link on a new device is the same group, instantly.` |
| 173 | `- **AES-128-GCM** key derived with HKDF-SHA-256 from the group's secret, never sent to the server. The same secret also yields a local ID (stays on the device), a relay room ID and an access proof (the only two things the server sees).` |
| 183 | append: `Each room is capped at 32 MiB; writes past that are refused and the app reports that the server couldn't save changes.` |

After the sentence about `worker/index.ts` (line 75) end the paragraph with "replace `APP_DOMAIN` there with your own domain before deploying", then add:

```
A room is addressed by a 64-character hex ID derived from the group's secret. The first client to connect stores a hash of its access proof; any other proof is answered with a `denied` message and a 1008 close. The Node relays apply the same rule and keep the hash in `<room>.auth` next to the room log.

`wrangler.toml` turns off Workers invocation logs so the access proof in the `Sec-WebSocket-Protocol` header isn't retained. Cloudflare's edge and any Logpush job you add yourself sit outside that setting, and the server sees the relay room ID and proof by design.
```

After the self-host section's last paragraph (line 130) add a rate-limit note and the upgrade guide:

```
Abuse beyond a single room is not handled in code. Put a rate limit on `/sync/` in your reverse proxy (for example nginx `limit_req` or Traefik's `rateLimit` middleware).

#### Upgrading to v3

v3 changes the sync protocol, so groups move to new keys. Members' data survives through export and restore.

1. Ask members to open the app online once, so their devices hold the latest data.
2. Pull the new image (change the tag from `:2` to `:3` if you pin it) and restart. Same volume, same variables, same port, nothing else changes.
3. Open each group on one device. v3 recognises the old format, does not try to sync it, and shows a banner with two buttons: export a backup, and restore it as a new group.
4. Share the new invite link of each restored group. Others join that link. Only one person per group does steps 3 and 4.
5. When everyone has moved, delete the old `*.jsonl` files from the data volume.

A restore keeps members, categories, payment methods, trips and expenses. It does not keep the activity log or conflict history, and whoever restores picks "this is me" again.
```

- [ ] **Step 6: Rollout checklist**

Create `docs/migration/rollout-checklist.md`:

```md
# v3 rollout checklist

Nothing deploys until the domain is final. Replace `APP_DOMAIN` everywhere first.

- [ ] Domain registered, zone in the same Cloudflare account, `CLOUDFLARE_API_TOKEN` scope includes it.
- [ ] `APP_DOMAIN` replaced in `wrangler.toml`, `.github/workflows/release.yml`, `README.md` and, on the `legacy` branch, `src/lib/migration.ts`. `rg APP_DOMAIN --glob '!docs/**'` finds nothing afterwards.
- [ ] `workers_dev = false` and `preview_urls = false` on the new Worker, so there is no second public origin.
- [ ] Cloudflare WAF rate-limit rule on `/sync/*`.
- [ ] Workers Logs checked: invocation logs are off, and a test connection leaves no `kostos1.` value in the dashboard. If that cannot be shown, the README says so.
- [ ] `wrangler deploy --dry-run` passes for the new Worker (this branch) and for the old one (the `legacy` branch).
- [ ] `release-legacy.yml` and its `production-legacy` environment exist, with their own Cloudflare secrets, pinned to the `legacy` branch.
- [ ] A short message sent to each of the 4 owners: what to do, a freeze date, the retirement date (`docs/migration/owner-message-and-runbook.md`).
- [ ] Rollback understood: `wrangler rollback` for code problems; old rooms stay until the retirement date.
- [ ] Final `rg "PRT-"`, `rg "kostos\.(app|fi)"` and `rg "kostos\.shynewt\.com"` outside `docs/`: only the chosen domain, the old domain in the legacy banner, and the old-format fixtures in tests and `sync.e2e.ts` remain.
```

- [ ] **Step 7: Verify and commit**

Run: `npm run check && npm test`
Expected: PASS.

```bash
git add e2e scripts/screenshots.js wrangler.toml .github/workflows/release.yml package.json package-lock.json README.md docs/migration/rollout-checklist.md
git commit -m "chore: ship v3 as its own worker, document the upgrade and the rollout"
```

---

### Task 11: Hosted migration

Spec, "Hosted migration". The old site is never redirected: installed apps and WebSocket upgrades do not follow redirects, and an unexported group would become unreachable. It keeps working, with a persistent banner, until a published retirement date at least three months out.

**One limit of the spec to plan around.** Installed PWAs run the *old* build until they accept the service worker update, and that prompt is rendered by the old code (`UpdateBanner.svelte`: "A new version of Kostos is ready." with a dismissible "Later"). The first legacy release cannot change that prompt. What it can do is make every *later* legacy release show a non-dismissible "update to see an important notice" prompt, so the plan ships the banner and the new prompt together in release one and uses follow-up releases (a freeze reminder, the retirement notice) for the stronger prompt. Dormant installs are reached through the owners of the 4 groups.

**Files on `feat/domain-migration` (part A):**
- Create: `.github/workflows/release-legacy.yml`
- Create: `docs/migration/owner-message-and-runbook.md`

**Files on `legacy` (part B):**
- Create: `src/lib/migration.ts`, `src/lib/migration.test.ts`
- Create: `src/lib/components/MigrationBanner.svelte`, `src/lib/components/MoveGroupCard.svelte`
- Modify: `src/routes/+layout.svelte`, `src/lib/components/ProjectAppBar.svelte`, `src/lib/components/UpdateBanner.svelte`
- Delete: `.github/workflows/release.yml`, `.github/workflows/docker.yml`

**Interfaces (part B):**
- `migration.ts`: `APP_HOST`, `NEW_ORIGIN`, `RETIREMENT_DATE`, `exportWarning(sync: SyncStatus, local: LocalState | null): string | null`, `UPDATE_NOTICE_TEXT`.
- Consumes `phase` and `pendingChanges` from `SyncStatus` (`src/lib/sync/status.ts`) and `LocalState.pendingChanges`, exactly as `describeSync` does (`Math.max(sync.pendingChanges, local?.pendingChanges ?? 0)`).

**Part A (this branch)**

- [ ] **Step 1: The legacy workflow**

`workflow_dispatch` workflows must exist on the default branch, so this file lives here, not on `legacy`, and checks out the legacy branch itself. Create `.github/workflows/release-legacy.yml`:

```yaml
name: Release legacy

# Deploys the `legacy` branch to the old Worker. The old site keeps its v2 protocol
# until its retirement date; never publish a GitHub release from `legacy`, or the
# Docker workflow would tag it as latest.
on:
  workflow_dispatch:

concurrency:
  group: deploy-legacy
  cancel-in-progress: false

jobs:
  deploy:
    name: Build + deploy the legacy branch to Cloudflare
    runs-on: ubuntu-latest
    environment:
      name: production-legacy
      url: https://kostos.shynewt.com
    permissions:
      contents: read
    steps:
      - name: Checkout the legacy branch
        uses: actions/checkout@v4
        with:
          ref: legacy

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install
        run: npm ci

      - name: Refuse to ship placeholders
        run: |
          test -f src/lib/migration.ts
          if grep -nE "^export const (APP_HOST|RETIREMENT_DATE) = '[A-Z_]+';" src/lib/migration.ts; then
            echo "Set APP_HOST and RETIREMENT_DATE in src/lib/migration.ts first"
            exit 1
          fi

      - name: Type-check
        run: npm run check

      - name: Test
        run: npm test

      - name: Build static bundle
        run: npm run build

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

The guard matches any all-caps placeholder instead of naming `APP_DOMAIN`, so the final `rg APP_DOMAIN` sweep does not trip over this workflow, and `test -f` makes a branch without the banner fail instead of passing silently (`grep` exits 2 on a missing file, which `if` treats as "no placeholder"). Create the `production-legacy` environment in the repository settings with its own `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets (scoped to the old Worker only), and require a reviewer. Check that the workflow shows up under Actions after merging to `main`.

- [ ] **Step 2: Owner message and runbook**

Create `docs/migration/owner-message-and-runbook.md`:

```md
# Moving the hosted groups to APP_DOMAIN

## Message to each group owner (4 groups)

> Kostos is moving from kostos.shynewt.com to APP_DOMAIN, and groups get new keys on the way. Yours needs moving once.
>
> 1. Agree with your group who moves it. Only that person does steps 2 and 3; everyone else waits for the new link and should not export.
> 2. On the old site, open the group while online and wait for "Up to date". Then choose Export backup in the "Moving this group?" box at the top of the group.
> 3. On APP_DOMAIN choose "Restore from backup", pick which member you are, and share the new invite link.
> 4. Everyone else opens the new link and picks their name. If you installed the app, reinstall it from APP_DOMAIN. On iPhone: remove the old icon, open APP_DOMAIN in Safari, tap Share, then Add to Home Screen.
>
> Please finish by FREEZE_DATE. Changes made on the old site after you export will not carry over. The old site keeps working, and keeps exporting, until RETIREMENT_DATE.
>
> What moves: members, categories, payment methods, trips and expenses. What doesn't: the activity log and conflict history. The person restoring picks "this is me" again.

## Runbook

1. Register the domain and add its zone to the Cloudflare account. Fill in `docs/migration/rollout-checklist.md`.
2. Replace `APP_DOMAIN` (see the checklist) and deploy this branch as the `kostos-app` Worker. Smoke test it: create a group, join it from a second browser.
3. Cut `legacy` from the last v2 tag (`git switch -c legacy v2.10.1`) and add the migration banner (see the commits on the `legacy` branch). Set `APP_HOST` and `RETIREMENT_DATE` in `src/lib/migration.ts`, push the branch, then run the "Release legacy" workflow. It refuses to deploy while either is still a placeholder.
4. Send the owner message. The retired site's banner links to the new site ("Open the new site").
5. The mover may paste the new invite link into the old group's description; it reaches every member through normal sync.
6. After FREEZE_DATE, send a reminder as a second legacy release (the non-dismissible update prompt now reaches phones that took release one).
7. On RETIREMENT_DATE (at least three months after step 4) take the old Worker down. Only the landing page and `/join` may redirect after that date; never redirect the app.

Rollback: `wrangler rollback` for either Worker. Old rooms are untouched until the old Worker is deleted.
```

- [ ] **Step 3: Commit part A**

```bash
git add .github/workflows/release-legacy.yml docs/migration/owner-message-and-runbook.md
git commit -m "ci: add a manual workflow that deploys the legacy branch, and the migration runbook"
```

**Part B (`legacy` branch)**

Do this after the new domain is registered. Start from a clean tree.

- [ ] **Step 4: Cut the branch and bring the export helper over**

```bash
git switch -c legacy v2.10.1
git cherry-pick "$(git log feat/domain-migration --grep='share the backup download helper' --format=%H -n 1)"
git rm .github/workflows/release.yml .github/workflows/docker.yml
git commit -m "chore: keep releases off the legacy branch"
```

Expected: the cherry-pick applies cleanly (it only touches `src/lib/io/exportFiles*` and the settings page's export code). The deletions make a stray release from `legacy` unable to deploy or publish.

- [ ] **Step 5: Write the failing test**

Create `src/lib/migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { exportWarning } from './migration';
import { LOCAL_STATUS, type SyncStatus } from './sync/status';

const synced: SyncStatus = { ...LOCAL_STATUS, phase: 'synced', lastSyncedAt: 1, pendingChanges: 0 };

describe('exportWarning', () => {
	it('stays quiet when the device is fully synced', () => {
		expect(exportWarning(synced, null)).toBeNull();
	});

	it('warns while anything is still syncing or unreachable', () => {
		for (const phase of ['loading', 'connecting', 'syncing', 'offline', 'error', 'local'] as const) {
			expect(exportWarning({ ...synced, phase }, null), phase).toContain('not finished syncing');
		}
	});

	it('warns when changes are waiting, from either the provider or local storage', () => {
		expect(exportWarning({ ...synced, pendingChanges: 2 }, null)).toContain('not finished syncing');
		const local = { phase: 'saved', pendingChanges: 1, lastSyncedAt: 1, unverifiedSince: null } as const;
		expect(exportWarning(synced, local)).toContain('not finished syncing');
	});
});
```

Run: `npx vitest run src/lib/migration.test.ts`
Expected: FAIL, cannot resolve `./migration`.

- [ ] **Step 6: Implement**

Create `src/lib/migration.ts`:

```ts
import type { LocalState } from './sync/persistence';
import type { SyncStatus } from './sync/status';

/** Both placeholders must be replaced before release; release-legacy.yml refuses to deploy otherwise. */
export const APP_HOST = 'APP_DOMAIN';
export const RETIREMENT_DATE = 'RETIREMENT_DATE';
export const NEW_ORIGIN = `https://${APP_HOST}`;

export const UPDATE_NOTICE_TEXT = 'Update to see an important notice about Kostos moving.';

/** A backup taken before the device is current can miss recent changes, so say so first. */
export function exportWarning(sync: SyncStatus, local: LocalState | null): string | null {
	const pending = Math.max(sync.pendingChanges, local?.pendingChanges ?? 0);
	if (sync.phase === 'synced' && pending === 0) return null;
	return 'This phone has not finished syncing, so the backup could miss recent changes. Open the group online and wait for “Up to date” first.';
}
```

Run: `npx vitest run src/lib/migration.test.ts`
Expected: PASS.

Create `src/lib/components/MigrationBanner.svelte` (always visible, not dismissible):

```svelte
<script lang="ts">
	import { APP_HOST, NEW_ORIGIN, RETIREMENT_DATE } from '$lib/migration';
</script>

<div class="migration" role="status">
	<p class="headline">Kostos is moving to {APP_HOST}</p>
	<p class="body">
		This site keeps working, and keeps exporting, until {RETIREMENT_DATE}. One person per group moves it: ask your group who,
		and do not export yourself if someone already did. Installed the app? Reinstall it from {APP_HOST} once your group has moved
		(on iPhone: remove the old icon, open {APP_HOST} in Safari, then Share and Add to Home Screen).
	</p>
	<a class="open" href={NEW_ORIGIN}>Open the new site</a>
</div>

<style>
	.migration {
		margin: 8px 12px; padding: 10px 12px; border-radius: var(--radius-sm);
		background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4;
	}
	.headline { margin: 0 0 4px; font-weight: 600; }
	.body { margin: 0 0 8px; }
	.open { color: var(--ink); font-weight: 600; text-decoration: underline; }
</style>
```

Create `src/lib/components/MoveGroupCard.svelte` (inside a group, next to the other banners):

```svelte
<script lang="ts">
	import { getContext } from 'svelte';
	import { backupFile, saveFile } from '$lib/io/exportFiles';
	import { exportWarning, NEW_ORIGIN } from '$lib/migration';
	import type { RoomState } from '$lib/sync/useRoom.svelte';

	const context = getContext<{ readonly room: RoomState } | undefined>('kostos-room');
	const room = $derived(context?.room);
	const warning = $derived(room ? exportWarning(room.sync, room.local) : null);

	function exportBackup() {
		if (room?.project) saveFile(backupFile(room.project, room.members, room.expenses));
	}
</script>

{#if room?.project}
	<section class="move" data-move-card>
		<p class="lead">Moving this group?</p>
		<p class="body">One person per group does it. Check with your group first; if someone already moved it, don’t export, just join their new link.</p>
		{#if warning}<p class="warning" role="alert">{warning}</p>{/if}
		<div class="actions">
			<button type="button" class="btn btn-primary" onclick={exportBackup}>{warning ? 'Export anyway' : 'Export backup'}</button>
			<a class="btn" href="{NEW_ORIGIN}/restore">Restore on the new site</a>
		</div>
	</section>
{/if}

<style>
	.move { margin: 0 22px 10px; padding: 12px; border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent); color: var(--ink); font-size: 13px; line-height: 1.4; }
	.lead { margin: 0 0 4px; font-weight: 600; }
	.body, .warning { margin: 0 0 8px; }
	.warning { font-weight: 600; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
```

Wire them in: `src/routes/+layout.svelte` imports `MigrationBanner` and renders `<MigrationBanner />` above `{@render children()}`; `ProjectAppBar.svelte` imports `MoveGroupCard` and renders `<MoveGroupCard />` after `<SyncBanner conflicts />`.

`src/lib/components/UpdateBanner.svelte`: this is the prompt a phone shows once it holds the legacy build and a *newer* legacy build is waiting. Replace the text and drop "Later" so it cannot be dismissed: change `A new version of Kostos is ready.` to `{UPDATE_NOTICE_TEXT}` (import it from `$lib/migration`), delete the `<button ... onclick={dismiss}>Later</button>` element, the `dismiss()` function and any `.dismiss-btn` rule that becomes unused. Leave `registerType: 'prompt'` in `vite.config.ts` alone: with `prompt`, a waiting service worker only activates when the person taps Update, and there is no `clientsClaim`, so this banner is the only path.

- [ ] **Step 7: Verify**

Run: `npm run check && npm test`
Expected: PASS.

Manual check of the update prompt (not automated; the component depends on `virtual:pwa-register`): build twice with a trivial text change in between, serve the first build with `npm run preview`, open it in Chromium so the service worker registers, serve the second build on the same origin, wait for the waiting worker, and confirm the bar reads "Update to see an important notice about Kostos moving." with only an Update button.

Also run `npm run build && npm run test:e2e` once on this branch to confirm the banners do not break existing selectors. Set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright has no downloaded browser, and run `git checkout -- docs/screenshots` afterwards: `sync.e2e.ts` rewrites the tracked screenshots.

- [ ] **Step 8: Commit and deploy**

```bash
git add src
git commit -m "feat: tell old-site users to move, and warn before an unsynced export"
```

Push `legacy`, fill in `APP_HOST` and `RETIREMENT_DATE` in `src/lib/migration.ts`, commit that, then run the "Release legacy" workflow from the Actions tab (it checks out `legacy` itself, and deploys with the branch's own `wrangler.toml`, which still names the `kostos` Worker and the old domain). Do not publish a GitHub release from `legacy`.

---

### Task 12: Quality pass

**Files:** the whole branch diff (`git diff main...HEAD`).

- [ ] **Step 1: Leftovers**

```bash
rg -n "PRT-|generateRoomId|ROOM_PATTERN|ROOM_ALPHABET|deriveLabel|<roomId>|ROOM\.SECRET" --glob '!node_modules' --glob '!docs/superpowers/**' .
rg -n "\?room=|room=" src scripts worker e2e README.md
rg -n "APP_DOMAIN|kostos\.(app|fi)|kostos\.shynewt\.com" --glob '!node_modules' --glob '!docs/superpowers/**' .
rg -n -i "\btoken\b" src README.md --glob '*.svelte' --glob '*.html' --glob '*.md'
```

Expected: the first two print only the old-format fixtures in `src/lib/token.test.ts` and `e2e/sync.e2e.ts`, the deliberate `'room='` check in `src/lib/token.ts` and the deliberate `/sync/PRT-AAAA-BBBB` rejection probes in `scripts/relays.test.ts`; the third prints only the `APP_DOMAIN` placeholders listed in the rollout checklist (and, on the `legacy` branch, the old domain in the banner and runbook); the fourth prints nothing user-facing. Anything else is a leftover to fix.

- [ ] **Step 2: Known duplicates to remove now**

- `src/lib/sync/provider.ts` line 14 declares its own `MAX_MESSAGE_BYTES`; import it from `./relay-protocol.js` and delete the copy.
- `src/lib/sync/provider.ts` lines 274 to 276 hex-encode a SHA-256 by hand; use `payloadHash(encrypted)` from `./relay-protocol.js`.
- Any second copy of the 64-hex or 43-character patterns (`rg -n "\{64\}|\{43\}" src scripts worker`): only `room-access.js`, `legacy.ts` and tests may hold them.
- The string `'DEMO'` outside `DEMO_ROOM_ID` (`rg -n "'DEMO'" src`).

- [ ] **Step 3: Run the review skills over the whole diff**

Run the `simplify` skill (it reviews the changed code for reuse, simplification and efficiency, and applies fixes). Then run the `code-review` skill against the branch (`main...HEAD`); read its findings before applying any with `--fix`. Fix what they find in small `refactor:` or `fix:` commits, and re-run `npm test` after each.

- [ ] **Step 4: Full verification**

```bash
npm run check
npm test
npm run build
npm run test:e2e
npx wrangler deploy --dry-run --outdir /tmp/kostos-dry-run
```

Then the Docker build and smoke test from Task 9, Step 6. On the `legacy` branch, run `npm run check`, `npm test` and `npx wrangler deploy --dry-run` as well.
Expected: everything passes.

- [ ] **Step 5: Confirm the quality bar**

- No dead code: nothing commented out, no unused exports (`rg -n "export" src/lib/token.ts src/lib/legacy.ts src/lib/io/restoreProject.ts src/lib/io/exportFiles.ts` and check each has a caller).
- No duplicated pattern or constant (Step 2).
- Limits are named: `MAX_MESSAGE_BYTES`, `MAX_ROOM_BYTES`, `PROOF_PREFIX`, `DENIED_CLOSE_CODE`, `SECRET_BYTES`.
- Shared plain JS is typed with JSDoc: `room-access.js` and `relay-protocol.js`, and `npm run check` is clean (`checkJs` is on).
- Every new rule has a test that failed first: room access, derivation vectors, provider subprotocol, denied handling, legacy guard, claim race, torn claim, cap, old-invite message.
- No em-dashes or double dashes in prose or comments: `rg -n -P "\x{2014}|\s--\s" --glob '*.md' --glob '*.ts' --glob '*.js' --glob '*.svelte' docs src scripts worker README.md` and check each hit is a Markdown table rule or a horizontal rule.
- Commit history reads as small Conventional Commits with no `Co-authored-by`.

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "refactor: apply review findings from the v3 branch"
```
