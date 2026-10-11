# Private rooms and domain migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sync room can only be entered by a client that holds the group's secret, with shorter invite links, ready to ship on the new domain next to the old one.

**Architecture:** The secret (16 random bytes, 22 base64url characters) is the whole token. HKDF-SHA-256 derives the AES key, a 64-hex server room ID, an auth proof and the local `PRT-XXXX-XXXX` label. The server routes by room ID and the Durable Object (or Node relay) stores `sha256(proof)` on the first connection and rejects any other proof. One shared JS module holds the access rules so the Worker, the Node relays and the client agree.

**Tech Stack:** SvelteKit 2 + Svelte 5, TypeScript, Yjs, Cloudflare Workers + Durable Objects (SQLite), Node `ws` relays, Vitest, Miniflare, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-11-private-rooms-and-domain-migration-design.md`

## Global Constraints

- Code style follows the surrounding files: tabs, single quotes, `type` not `interface`, `T[]` not `Array<T>`.
- No em-dashes and no double dashes in code comments, docs or copy.
- Comments only where the code can't explain itself; short, why not what.
- Never edit generated code.
- Commits: Conventional Commits, one short line, no `Co-authored-by`.
- Secret: exactly 22 base64url characters (`^[A-Za-z0-9_-]{22}$`).
- Room ID on the wire: exactly 64 lowercase hex characters, in the path `/sync/<room id>`.
- Auth proof: 43 base64url characters, offered as WebSocket subprotocol `kostos1.<proof>`.
- HKDF info strings are `kostos/<purpose>/v1` with purposes `encryption` (128 bits), `room` (256), `auth` (256), `label` (64). SHA-256, empty salt. Changing any of these orphans every group, so a pinned test guards them.
- Share link: `https://<domain>/join#<secret>`. The `?room=` parameter and the `ROOM.SECRET` form are gone and must be rejected.
- Local project key stays the derived label (`PRT-XXXX-XXXX`), so `/p/<label>` routes and storage keep their shape. Demo mode (`roomId === 'DEMO'`) must keep working.
- Test commands: `npx vitest run <path>` for one file, `npm test` for all, `npm run check` for types.

## Review Focus

- Room ID in the wrong form (uppercase hex, 63 or 65 characters, a legacy `PRT-...` name, a percent-encoded slash) gets 400 and never reaches a Durable Object. Tested in Task 5.
- Two devices connecting at the same moment to an unclaimed room with different proofs: exactly one gets in. Tested in Tasks 5 and 6.
- `Sec-WebSocket-Protocol` carrying several protocols, whitespace, or a proof of the wrong length: the valid one is used or the request is refused, never a crash. Tested in Task 1.
- Someone pastes an old invite (`?room=...#<43 chars>`, `PRT-XXXX-XXXX.secret`, a 43-character key) into the join box: a clear error, no navigation. Tested in Task 4.
- Chat apps append a period, wrap the link in `<>` or put it inside a sentence, and keys can end in `-` or `_`: all still parse. Tested in Task 4.

---

### Task 1: Shared room access rules

**Files:**
- Create: `src/lib/sync/room-access.js`
- Create: `src/lib/sync/room-access.test.ts`

**Interfaces:**
- Produces:
  - `PROOF_PREFIX: 'kostos1.'`
  - `parseRoomId(raw: string): string | null` (canonical 64 lowercase hex or null)
  - `parseProofProtocol(header: string | null | undefined): { protocol: string; proof: string } | null`
  - `proofHash(proof: string): Promise<string>` (sha256 hex of the proof text)
  - `hashesEqual(a: string, b: string): boolean` (constant-time)

- [ ] **Step 1: Write the failing test**

Create `src/lib/sync/room-access.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashesEqual, parseProofProtocol, parseRoomId, PROOF_PREFIX, proofHash } from './room-access.js';

const room = 'a1'.repeat(32);
const proof = 'A'.repeat(43);

describe('parseRoomId', () => {
	it('accepts exactly 64 lowercase hex characters', () => {
		expect(parseRoomId(room)).toBe(room);
	});

	it('rejects legacy names, uppercase, wrong lengths and non-hex', () => {
		expect(parseRoomId('PRT-AB23-CD45')).toBeNull();
		expect(parseRoomId(room.toUpperCase())).toBeNull();
		expect(parseRoomId(room.slice(1))).toBeNull();
		expect(parseRoomId(`${room}0`)).toBeNull();
		expect(parseRoomId(`${'g'.repeat(64)}`)).toBeNull();
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
});

describe('proof hashing', () => {
	it('hashes deterministically to 64 hex characters and tells proofs apart', async () => {
		const first = await proofHash(proof);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(await proofHash(proof)).toBe(first);
		expect(await proofHash('B'.repeat(43))).not.toBe(first);
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
const ROOM_ID_PATTERN = /^[0-9a-f]{64}$/;
const PROOF_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** @param {string} raw @returns {string | null} */
export function parseRoomId(raw) {
	return ROOM_ID_PATTERN.test(raw) ? raw : null;
}

/** @param {string | null | undefined} header @returns {{ protocol: string, proof: string } | null} */
export function parseProofProtocol(header) {
	for (const part of (header ?? '').split(',')) {
		const protocol = part.trim();
		if (!protocol.startsWith(PROOF_PREFIX)) continue;
		const proof = protocol.slice(PROOF_PREFIX.length);
		if (PROOF_PATTERN.test(proof)) return { protocol, proof };
	}
	return null;
}

/** @param {string} proof */
export function proofHash(proof) {
	return payloadHash(new TextEncoder().encode(proof));
}

/** @param {string} a @param {string} b */
export function hashesEqual(a, b) {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return difference === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/room-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/room-access.js src/lib/sync/room-access.test.ts
git commit -m "feat(sync): add shared room access rules"
```

---

### Task 2: Derive key, room ID, proof and label from the secret

**Files:**
- Modify: `src/lib/sync/crypto.ts`
- Modify: `src/lib/sync/crypto.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (all in `src/lib/sync/crypto.ts`):
  - `type RoomAccess = { roomId: string; proof: string }`
  - `deriveKey(secret: string): Promise<CryptoKey>` (same name, now HKDF, AES-128-GCM)
  - `deriveRoomAccess(secret: string): Promise<RoomAccess>`
  - `deriveLabel(secret: string): Promise<string>` (`PRT-XXXX-XXXX`)
  - `base64UrlEncode(bytes: Uint8Array): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/sync/crypto.test.ts` (and extend its first import line to `import { base64UrlEncode, decryptPayload, deriveKey, deriveLabel, deriveRoomAccess, encryptPayload } from './crypto';`):

```ts
describe('secret derivations', () => {
	const pinnedSecret = 'AAECAwQFBgcICQoLDA0ODw';

	it('matches pinned vectors, so a change that would orphan every group fails here', async () => {
		expect(await deriveRoomAccess(pinnedSecret)).toEqual({
			roomId: '240d9fce60d8bf1f1f868e3d307862a79cf6e7e60e9605076bc36adce20a07c9',
			proof: '_3Uo_pBmGvtA0V2fpVX1h0L-hz9fr3PSDdvJ9Cm3E3Q'
		});
		expect(await deriveLabel(pinnedSecret)).toBe('PRT-Y5LX-2BZN');
		const payload = Uint8Array.from(atob('BwcHBwcHBwcHBwcHUQkHPplByfuAT6mNcOrvGpioGf8sCl4WA1lCmg=='), (c) => c.charCodeAt(0));
		const plain = await decryptPayload(await deriveKey(pinnedSecret), payload);
		expect(new TextDecoder().decode(plain)).toBe('hello kostos');
	});

	it('gives every purpose its own value', async () => {
		const { roomId, proof } = await deriveRoomAccess(pinnedSecret);
		expect(roomId).toMatch(/^[0-9a-f]{64}$/);
		expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(roomId).not.toContain(proof);
		expect(await deriveLabel(pinnedSecret)).toMatch(/^PRT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
	});

	it('separates different secrets', async () => {
		const other = base64UrlEncode(new Uint8Array(16).fill(9));
		expect((await deriveRoomAccess(other)).roomId).not.toBe((await deriveRoomAccess(pinnedSecret)).roomId);
		expect(await deriveLabel(other)).not.toBe(await deriveLabel(pinnedSecret));
	});

	it('encodes bytes without padding', () => {
		expect(base64UrlEncode(new Uint8Array(16))).toHaveLength(22);
		expect(base64UrlEncode(Uint8Array.from([251, 255, 254]))).toBe('-__-');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/crypto.test.ts`
Expected: FAIL, `deriveRoomAccess` / `deriveLabel` / `base64UrlEncode` are not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/sync/crypto.ts` replace the header comment and `deriveKey`, and add the new exports and `base64UrlEncode` next to `base64UrlDecode`:

```ts
/* AES-GCM helpers for the encrypted sync transport.
 *
 * The project secret (16 random bytes, base64url) is the only thing a group shares. HKDF-SHA-256
 * turns it into independent values: the AES-128-GCM key (never leaves the device), the server
 * room id and auth proof (sent to the server), and a short display label.
 * Each encrypted payload is `iv (12 bytes) | ciphertext+tag`. IVs are random per message,
 * which is required for AES-GCM safety. Server sees only opaque ciphertext.
 */

const KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];
const LABEL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 characters, no lookalikes

export type RoomAccess = { roomId: string; proof: string };

async function expand(secretBase64Url: string, purpose: string, bits: number): Promise<Uint8Array> {
	const base = await crypto.subtle.importKey('raw', base64UrlDecode(secretBase64Url) as BufferSource, 'HKDF', false, ['deriveBits']);
	const info = new TextEncoder().encode(`kostos/${purpose}/v1`);
	const derived = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, base, bits);
	return new Uint8Array(derived);
}

export async function deriveKey(secretBase64Url: string): Promise<CryptoKey> {
	const raw = await expand(secretBase64Url, 'encryption', 128);
	return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, KEY_USAGES);
}

export async function deriveRoomAccess(secretBase64Url: string): Promise<RoomAccess> {
	const [room, proof] = await Promise.all([expand(secretBase64Url, 'room', 256), expand(secretBase64Url, 'auth', 256)]);
	return { roomId: Array.from(room, (byte) => byte.toString(16).padStart(2, '0')).join(''), proof: base64UrlEncode(proof) };
}

export async function deriveLabel(secretBase64Url: string): Promise<string> {
	const bytes = await expand(secretBase64Url, 'label', 64);
	const chars = Array.from(bytes, (byte) => LABEL_ALPHABET[byte % LABEL_ALPHABET.length]);
	return `PRT-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function base64UrlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

Keep `encryptPayload`, `decryptPayload` and `base64UrlDecode` as they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sync/crypto.test.ts`
Expected: PASS (the old round-trip tests keep working with their 32-byte secrets).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/crypto.ts src/lib/sync/crypto.test.ts
git commit -m "feat(sync): derive key, room id, proof and label from the secret with HKDF"
```

---

### Task 3: Provider connects with the derived room and proof

**Files:**
- Modify: `src/lib/sync/provider.ts` (constructor ~line 48, connect ~line 104, `createSyncProvider` ~line 404)
- Modify: `src/lib/sync/doc.ts` (lines 57 and 83)
- Modify: `src/lib/sync/provider.test.ts`

**Interfaces:**
- Consumes: `deriveRoomAccess`, `RoomAccess` (Task 2); `PROOF_PREFIX` (Task 1).
- Produces:
  - `new EncryptedSyncProvider(doc: Y.Doc, url: string, secret: string, persistence?: RoomPersistence)` (the `roomId` argument is gone)
  - `createSyncProvider(doc: Y.Doc, url: string | undefined, secret: string, persistence?: RoomPersistence): EncryptedSyncProvider | null`

- [ ] **Step 1: Write the failing test and adapt the harness**

In `src/lib/sync/provider.test.ts`:

1. Extend the crypto import to `import { deriveKey, deriveRoomAccess, decryptPayload, encryptPayload } from './crypto';`.
2. Make the fake socket remember how it was opened:

```ts
	constructor(public url = '', public protocols: string | string[] = []) { Socket.instances.push(this); }
```

3. Replace all five `new EncryptedSyncProvider(doc, 'ws://test', 'ROOM', secret)` with `new EncryptedSyncProvider(doc, 'ws://test', secret)`.
4. Add inside `describe('verified encrypted sync', ...)`:

```ts
	it('connects to the derived room and offers the auth proof as a subprotocol', async () => {
		await start();
		const access = await deriveRoomAccess(secret);
		expect(Socket.instances[0].url).toBe(`ws://test/${access.roomId}`);
		expect(Socket.instances[0].protocols).toEqual([`kostos1.${access.proof}`]);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sync/provider.test.ts`
Expected: FAIL (the provider still treats the third argument as the room ID and opens `ws://test/<secret>`).

- [ ] **Step 3: Write the implementation**

In `src/lib/sync/provider.ts`:

- Extend the existing import from `./crypto` with `deriveRoomAccess` and `type RoomAccess`, and add `import { PROOF_PREFIX } from './room-access.js';`.
- Add a field next to `private revision = 0;`:

```ts
	private access: RoomAccess | null = null;
```

- Change the constructor head and its first lines:

```ts
	constructor(private doc: Y.Doc, private url: string, secret: string, private persistence?: RoomPersistence) {
		this.key = deriveKey(secret);
		const access = deriveRoomAccess(secret);
```

- Change the `Promise.all` that starts the first connection:

```ts
		void Promise.all([persistence?.ready ?? Promise.resolve(), this.key, access]).then(([, , derived]) => {
			this.access = derived;
			const hasData = doc.store.clients.size > 0;
```

(the rest of that callback stays as is).

- In `connect()`, right after the `navigator.onLine === false` block, add `const access = this.access; if (!access) return;` and replace the socket creation:

```ts
		try { ws = new WebSocket(`${this.url}/${access.roomId}`, [`${PROOF_PREFIX}${access.proof}`]); }
```

- Change the factory:

```ts
export function createSyncProvider(doc: Y.Doc, url: string | undefined, secret: string, persistence?: RoomPersistence): EncryptedSyncProvider | null {
	if (!browser || !url) return null;
	return new EncryptedSyncProvider(doc, url, secret, persistence);
}
```

In `src/lib/sync/doc.ts`, drop the `roomId` argument at both call sites:

```ts
createSyncProvider(cached.handle.doc, syncUrl(), effectiveSecret, cached.persistence)
createSyncProvider(doc, syncUrl(), effectiveSecret, persistence)
```

- [ ] **Step 4: Run tests and types**

Run: `npx vitest run src/lib/sync/provider.test.ts`
Expected: PASS.
Run: `npm run check`
Expected: no new errors from these files (token.ts call sites are still old and compile; they change in Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/provider.ts src/lib/sync/doc.ts src/lib/sync/provider.test.ts
git commit -m "feat(sync): connect to the derived room and send the auth proof"
```

---

### Task 4: Secret-only tokens and the join flow

**Files:**
- Modify: `src/lib/token.ts` (rewrite)
- Modify: `src/lib/token.test.ts` (rewrite)
- Modify: `src/routes/+page.svelte` (lines ~37-41, token input ~160)
- Modify: `src/routes/scan/+page.svelte` (line ~20)
- Modify: `src/routes/new/+page.svelte` (lines 11, 22, 77-79)
- Modify: `src/routes/import/+page.svelte` (lines 7, 67-68)
- Modify: `src/routes/restore/+page.svelte` (lines 7, 53-54)
- Modify: `src/routes/join/+page.svelte` (lines 22-33 and the effect below it)
- Modify: `src/lib/components/ProjectAppBar.svelte` (line 22)
- Modify: `src/lib/storage.ts` (doc comment on `ProjectRef.roomId`)

**Interfaces:**
- Consumes: `base64UrlEncode`, `deriveLabel` (Task 2).
- Produces:
  - `type ParsedToken = { secret: string }`
  - `generateSecret(): string` (22 characters)
  - `isValidSecret(value: string): boolean`
  - `parseToken(raw: string): ParsedToken | null`

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateSecret, isValidSecret, parseToken } from './token';

const secret = 'AAECAwQFBgcICQoLDA0ODw';

describe('parseToken', () => {
	it('reads the share link the app hands out', () => {
		expect(parseToken(`https://kostos.app/join#${secret}`)).toEqual({ secret });
	});

	it('reads links pasted without a scheme, wrapped, or inside a sentence', () => {
		const link = `kostos.app/join#${secret}`;
		expect(parseToken(link)).toEqual({ secret });
		expect(parseToken(`<https://${link}>`)).toEqual({ secret });
		expect(parseToken(`Join us here: https://${link}.`)).toEqual({ secret });
		expect(parseToken(`(https://${link})`)).toEqual({ secret });
	});

	it('reads the bare key and keeps its case', () => {
		expect(parseToken(`  ${secret} `)).toEqual({ secret });
		expect(parseToken('abc-_ABC-_abc-_ABC-_a')).toEqual({ secret: 'abc-_ABC-_abc-_ABC-_a' });
	});

	it('keeps keys that end in - or _', () => {
		expect(parseToken('https://kostos.app/join#abcdefghijklmnopqrst-_')).toEqual({ secret: 'abcdefghijklmnopqrst-_' });
	});

	it('rejects the old link and token forms with a null result', () => {
		const old = 'Wk3y_-SecretWithEnoughLength0123456789abcd';
		expect(parseToken(`https://kostos.app/join?room=PRT-AB23-CD45#${old}`)).toBeNull();
		expect(parseToken(`PRT-AB23-CD45.${secret}`)).toBeNull();
		expect(parseToken(old)).toBeNull();
		expect(parseToken('PRT-AB23-CD45')).toBeNull();
	});

	it('rejects links without a key, wrong lengths and stray characters', () => {
		expect(parseToken('https://kostos.app/join')).toBeNull();
		expect(parseToken(secret.slice(1))).toBeNull();
		expect(parseToken(`${secret}x`)).toBeNull();
		expect(parseToken(`${secret}<script>`)).toBeNull();
		expect(parseToken('')).toBeNull();
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/token.test.ts`
Expected: FAIL (`isValidSecret` missing, old parser behavior).

- [ ] **Step 3: Rewrite `src/lib/token.ts`**

```ts
/* Project-token helpers.
 *
 * A project token is its secret: 16 random bytes as 22 base64url characters. The encryption
 * key, the server room id, the auth proof and the `PRT-XXXX-XXXX` label are all derived from
 * it in `sync/crypto.ts`, so the secret is the only thing a group shares:
 *     https://kostos.app/join#<secret>
 * Browsers don't send `#...` in requests, so the secret stays out of server logs and referers.
 */
import { base64UrlEncode } from './sync/crypto';

export type ParsedToken = { secret: string };

const SECRET_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function generateSecret(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes);
}

export function isValidSecret(value: string): boolean {
	return SECRET_PATTERN.test(value);
}

/** Accept the share link (`/join#SECRET`) or the bare secret. */
export function parseToken(raw: string): ParsedToken | null {
	const candidate = extractCandidate(raw);
	const secret = candidate.includes('#') ? candidate.slice(candidate.indexOf('#') + 1) : candidate;
	return isValidSecret(secret) ? { secret } : null;
}

/** Chat apps paste links with surrounding text, `<...>` wrappers, a sentence's final period,
 *  or without the scheme. None of those characters can appear in a secret. */
function extractCandidate(raw: string): string {
	const words = raw.trim().split(/\s+/);
	const word = words.find((w) => w.includes('#')) ?? words[words.length - 1] ?? '';
	return word.replace(/^[<(]+/, '').replace(/[.,;:!?)>]+$/, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the pages**

`src/routes/+page.svelte`:

```ts
	function onJoinSubmit(event: SubmitEvent) {
		event.preventDefault();
		const parsed = parseToken(token);
		if (!parsed) {
			error = 'That does not look right. Paste the full invite link or the 22-character group key.';
			return;
		}
		error = null;
		goto(`/join#${parsed.secret}`);
	}
```

and on the token `<input>`: `placeholder="Invite link or group key"` and `autocapitalize="off"` (keys are case sensitive). Change the eyebrow text `Paste a group token` to `Paste an invite link or group key`.

`src/routes/scan/+page.svelte`: `goto(`/join#${parsed.secret}`);`

`src/lib/components/ProjectAppBar.svelte`: `return `${location.origin}/join#${stored.secret}`;`

`src/lib/storage.ts`: change the `ProjectRef.roomId` comment to `/** Local project key and display label derived from the secret (e.g. `PRT-4F2K-9XBA`); never sent to the server. */` and the `secret` comment to `/** The group's only shared value. Lives in the URL fragment and localStorage; the server never sees it. */`.

`src/routes/new/+page.svelte`:
- Line 11 becomes `import { generateSecret } from '$lib/token';` and add `import { deriveLabel } from '$lib/sync/crypto';`.
- Replace lines 22-23 with:

```ts
	const secret = generateSecret();
	let roomId = $state('');
	void deriveLabel(secret).then((label) => (roomId = label));
```

- In `onSubmit` (line 77), add `if (!roomId) return;` on the line right after `event?.preventDefault();`, so a submit before the label resolves is ignored without a native form post.
- The token pill copy near line 275 becomes: eyebrow `Your group label will be`, hint `Derived from the group key. Share the invite link from the group's Share button.`

`src/routes/import/+page.svelte` and `src/routes/restore/+page.svelte`: change the import to `import { generateSecret } from '$lib/token';` plus `import { deriveLabel } from '$lib/sync/crypto';`, and replace

```ts
const roomId = generateRoomId();
const secret = generateSecret();
```

with

```ts
const secret = generateSecret();
const roomId = await deriveLabel(secret);
```

`src/routes/join/+page.svelte`:
- Add imports `import { deriveLabel } from '$lib/sync/crypto';` and `import { isValidSecret } from '$lib/token';`.
- Replace the `roomId` and `secret` lines (22-23) with:

```ts
	const secret = $derived.by(() => {
		const hash = page.url.hash.startsWith('#') ? page.url.hash.slice(1) : '';
		return isValidSecret(hash) ? hash : '';
	});
	let roomId = $state('');
	$effect(() => {
		const current = secret;
		roomId = '';
		if (current) void deriveLabel(current).then((label) => { if (current === secret) roomId = label; });
	});
```

- In the status effect, replace `if (!room) { status = 'invalid'; return; }` with:

```ts
		if (!secret) { status = 'invalid'; return; }
		if (!room) { status = 'parsing'; return; }
```

- Change the invalid copy to `This invite link is missing the group key. Ask the sender to share the full link from their <strong>Share</strong> button.`

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: no errors (no remaining references to `generateRoomId` or `ParsedToken.roomId`; confirm with `rg -n "generateRoomId|parsed.roomId" src`, expecting no matches).
Run: `npm test`
Expected: PASS except any test that still builds old-style links (none expected outside e2e and `scripts/`, handled in Tasks 5 to 7).

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: make the group secret the whole invite token"
```

---

### Task 5: Worker and Durable Object enforce room access

**Files:**
- Modify: `worker/index.ts` (lines 25-31)
- Modify: `src/lib/server/sync-do.ts` (constructor tables, `fetch`)
- Modify: `scripts/worker-relay.test.ts`

**Interfaces:**
- Consumes: `parseRoomId`, `parseProofProtocol`, `proofHash`, `hashesEqual` (Task 1).
- Produces: `/sync/<64 hex>` answers 400 for a bad room, 401 without or with a wrong proof, 101 with `Sec-WebSocket-Protocol` echoed otherwise.

- [ ] **Step 1: Adapt the Miniflare tests and add the new ones**

In `scripts/worker-relay.test.ts`:

1. Add `import { createHash } from 'node:crypto';`.
2. Add helpers below the imports:

```ts
const PROOF = 'P'.repeat(43);
const room = (name: string) => createHash('sha256').update(name).digest('hex');
```

3. Seed with hashed names: replace the two seeding lines with

```ts
	await mf.dispatchFetch(`http://local/sync/${room('small')}?count=3`);
	await mf.dispatchFetch(`http://local/sync/${room('capped')}?count=1000`);
```

4. Replace `connect`:

```ts
async function connect(name: string, proof = PROOF) {
	const url = await mf.ready;
	const ws = new WebSocket(`ws://${url.host}/sync/${room(name)}`, [`kostos1.${proof}`]); clients.push(ws);
	const binary: Buffer[] = [];
	const controls: Record<string, unknown>[] = [];
	ws.on('message', (data, isBinary) => { if (isBinary) binary.push(Buffer.from(data as Buffer)); else controls.push(JSON.parse(data.toString())); });
	await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
	await until(() => controls.some((m) => m.type === 'ready'));
	return { ws, binary, controls };
}

function statusOf(name: string, proof: string): Promise<number> {
	return mf.ready.then((url) => new Promise<number>((resolve) => {
		const ws = new WebSocket(`ws://${url.host}/sync/${room(name)}`, [`kostos1.${proof}`]); clients.push(ws);
		ws.once('open', () => { ws.terminate(); resolve(101); });
		ws.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
		ws.once('error', () => resolve(-1));
	}));
}
```

5. Lowercase every room name passed to `connect(...)`:

```bash
sed -i "s/connect('SMALL')/connect('small')/g; s/connect('CAPPED')/connect('capped')/g; s/connect('LIVE')/connect('live')/g; s/connect('COMPACT')/connect('compact')/g" scripts/worker-relay.test.ts
```

6. Add a new `describe` at the end of the file:

```ts
describe('room access', () => {
	const upgrade = { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `kostos1.${PROOF}` };

	it('answers 400 for a room id that is not 64 lowercase hex, before any Durable Object runs', async () => {
		for (const bad of ['SMALL', 'PRT-AAAA-BBBB', room('x').toUpperCase(), room('x').slice(1), `${room('x')}0`, '%2F']) {
			const response = await mf.dispatchFetch(`http://local/sync/${bad}`, { headers: upgrade });
			expect(response.status, bad).toBe(400);
		}
	});

	it('answers 401 when no proof is offered', async () => {
		const response = await mf.dispatchFetch(`http://local/sync/${room('open')}`, { headers: { Upgrade: 'websocket' } });
		expect(response.status).toBe(401);
	});

	it('lets the first proof claim a room and refuses every other proof, now and after a restart', async () => {
		await connect('claimed');
		expect(await statusOf('claimed', 'Q'.repeat(43))).toBe(401);
		expect(await statusOf('claimed', PROOF)).toBe(101);
		for (const client of clients.splice(0)) client.terminate();
		await mf.dispose(); mf = new Miniflare({ ...options(), script }); await mf.ready;
		expect(await statusOf('claimed', 'Q'.repeat(43))).toBe(401);
		expect(await statusOf('claimed', PROOF)).toBe(101);
	});

	it('gives a room to exactly one of two simultaneous first connections', async () => {
		const outcomes = await Promise.all([statusOf('race', 'A'.repeat(43)), statusOf('race', 'B'.repeat(43))]);
		expect(outcomes.sort()).toEqual([101, 401]);
	});
});
```

(The restart test runs last among the cold-start cases; the earlier cold-restart test already re-creates `mf` the same way.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/worker-relay.test.ts`
Expected: FAIL (connections without server-side checks succeed; bad rooms are not rejected).

- [ ] **Step 3: Implement the Worker check**

`worker/index.ts`: add `import { parseProofProtocol, parseRoomId } from '../src/lib/sync/room-access.js';` and replace the `/sync/` block body after the Upgrade check:

```ts
			let rawRoomId = '';
			try {
				rawRoomId = decodeURIComponent(url.pathname.slice('/sync/'.length));
			} catch {
				return new Response('Bad roomId', { status: 400 });
			}
			const roomId = parseRoomId(rawRoomId);
			if (!roomId) return new Response('Bad roomId', { status: 400 });
			if (!parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'))) return new Response('Unauthorized', { status: 401 });
			return env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(roomId)).fetch(request);
```

- [ ] **Step 4: Implement the Durable Object check**

`src/lib/server/sync-do.ts`: add `import { hashesEqual, parseProofProtocol, proofHash } from '../sync/room-access.js';`. In the constructor next to the other `CREATE TABLE` lines:

```ts
			ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_auth (id INTEGER PRIMARY KEY CHECK (id = 1), proof_hash TEXT NOT NULL)');
```

Add a method before `fetch`:

```ts
	// first proof to connect claims the room; every later connection must present the same one
	private async authorize(proof: string): Promise<boolean> {
		const hash = await proofHash(proof);
		const claimed = this.ctx.storage.sql.exec<{ proof_hash: string }>('SELECT proof_hash FROM room_auth WHERE id = 1').toArray()[0];
		if (!claimed) {
			this.ctx.storage.sql.exec('INSERT INTO room_auth (id, proof_hash) VALUES (1, ?)', hash);
			return true;
		}
		return hashesEqual(claimed.proof_hash, hash);
	}
```

Change `fetch`:

```ts
	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
		const offered = parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'));
		if (!offered) return new Response('Unauthorized', { status: 401 });
		await this.initialized;
		return this.serialized(async () => {
			if (!(await this.authorize(offered.proof))) return new Response('Unauthorized', { status: 401 });
			const pair = new WebSocketPair();
```

and the final response of that block becomes:

```ts
			return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': offered.protocol } });
```

- [ ] **Step 5: Run to verify**

Run: `npx vitest run scripts/worker-relay.test.ts`
Expected: PASS, including the legacy migration tests.

- [ ] **Step 6: Commit**

```bash
git add worker/index.ts src/lib/server/sync-do.ts scripts/worker-relay.test.ts
git commit -m "feat(sync): require the room proof on the worker and durable object"
```

---

### Task 6: Node relays enforce room access

**Files:**
- Modify: `scripts/relay.js`
- Modify: `scripts/serve.js` (upgrade handler, lines ~117-141)
- Modify: `scripts/sync-server.js`
- Modify: `scripts/durable-relay.test.ts`
- Modify: `scripts/relays.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `createRelay(directory)` returns `attach(ws, id: string, proof: string)`; a room's claim lives in `<sha256(id)>.auth` beside its log.

- [ ] **Step 1: Adapt and extend the tests**

`scripts/durable-relay.test.ts`:

- Add `import { parseProofProtocol } from '../src/lib/sync/room-access.js';` and `const PROOF = 'P'.repeat(43);`.
- In `start`, change the connection handler to read the proof from the handshake:

```ts
	server.on('connection', (ws, request) => attach(ws, 'ROOM', parseProofProtocol(request.headers['sec-websocket-protocol'])?.proof ?? ''));
```

- Change `connect`:

```ts
async function connect(url: string, proof = PROOF) {
	const ws = new WebSocket(url, [`kostos1.${proof}`]); sockets.push(ws);
```

(the rest of the function is unchanged).

- Add two tests inside `describe('durable encrypted relay', ...)`:

```ts
	it('lets the first proof claim the room and closes sockets with any other proof', async () => {
		const url = await start(); const owner = await connect(url);
		await until(() => owner.controls.some((m) => m.type === 'ready'));
		const intruder = await connect(url, 'Q'.repeat(43));
		const code = await new Promise<number>((resolve) => intruder.ws.once('close', (c) => resolve(c)));
		expect(code).toBe(1008);
		expect(intruder.controls.some((m) => m.type === 'ready')).toBe(false);
		expect(intruder.binary).toHaveLength(0);
	});
	it('remembers the claim across a restart', async () => {
		const url = await start(); const owner = await connect(url);
		await until(() => owner.controls.some((m) => m.type === 'ready'));
		await stop();
		const restarted = await start(directory);
		const intruder = await connect(restarted, 'Q'.repeat(43));
		expect(await new Promise<number>((resolve) => intruder.ws.once('close', (c) => resolve(c)))).toBe(1008);
		const again = await connect(restarted);
		await until(() => again.controls.some((m) => m.type === 'ready'));
	});
	it('gives an unclaimed room to exactly one of two simultaneous first connections', async () => {
		const url = await start();
		const [a, b] = await Promise.all([connect(url, 'A'.repeat(43)), connect(url, 'B'.repeat(43))]);
		await new Promise((resolve) => setTimeout(resolve, 300));
		const admitted = [a, b].filter((peer) => peer.controls.some((m) => m.type === 'ready'));
		expect(admitted).toHaveLength(1);
	});
```

`scripts/relays.test.ts`:

- Add `const ROOM = 'a'.repeat(64);` and `const PROOF_PROTOCOL = `kostos1.${'P'.repeat(43)}`;`.
- Change `UPGRADE_HEADERS` to end with the proof header:

```ts
const UPGRADE_HEADERS =
	'Host: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
	'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n' +
	`Sec-WebSocket-Protocol: ${PROOF_PROTOCOL}\r\n\r\n`;
```

- In `pingPong`: `new WebSocket(`ws://127.0.0.1:${port}/sync/${ROOM}`, [PROOF_PROTOCOL])`.
- In `relays`: serve.js probes become `{ [`/sync/${ROOM}`]: 'upgraded', '/sync/PRT-AAAA-BBBB': 'rejected', '/sync/%ZZ': 'rejected', '/not-sync': 'rejected' }`; sync-server.js probes become `{ [`/sync/${ROOM}`]: 'upgraded', '/sync/%ZZ': 'upgraded', '/': 'upgraded' }`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/durable-relay.test.ts scripts/relays.test.ts`
Expected: FAIL (no claim logic; `/sync/PRT-AAAA-BBBB` still upgrades on serve.js).

- [ ] **Step 3: Implement `relay.js`**

- Add `import { hashesEqual, proofHash } from '../src/lib/sync/room-access.js';` (the existing `node:fs/promises` imports already cover `open` and `readFile`).
- In `makeRoom` add `authHash: /** @type {string | null} */ (null),` and `authFile: resolve(directory, `${createHash('sha256').update(id).digest('hex')}.auth`),`.
- In `load`, before `room.loaded = true;`:

```js
		try { room.authHash = (await readFile(room.authFile, 'utf8')).trim() || null; }
		catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error; }
```

- Add above `attach`:

```js
	/** The first proof to connect claims the room; every later connection must match it.
	 *  @param {ReturnType<typeof makeRoom>} room @param {string} proof */
	async function authorize(room, proof) {
		const hash = await proofHash(proof);
		if (room.authHash !== null) return hashesEqual(room.authHash, hash);
		const file = await open(room.authFile, 'wx');
		try { await file.writeFile(hash); await file.sync(); } finally { await file.close(); }
		room.authHash = hash;
		return true;
	}
```

- Change the factory signature to `return function attach(ws, id, proof) {` (and its JSDoc to `@param {import('ws').WebSocket} ws @param {string} id @param {string} proof`).
- First enqueued block becomes:

```js
		enqueue(activeRoom, ws, async () => {
			await load(activeRoom);
			if (ws.readyState !== ws.OPEN) return;
			if (!(await authorize(activeRoom, proof))) { ws.close(1008, 'Unauthorized'); return; }
			activeRoom.sockets.add(ws);
```

- Make queued work ignore sockets that were never admitted: the barrier enqueue callback starts with `if (!activeRoom.sockets.has(ws)) return;`, and so does the binary-message enqueue callback (first line inside it).

- [ ] **Step 4: Implement `serve.js` and `sync-server.js`**

`serve.js`: add `import { parseProofProtocol, parseRoomId } from '../src/lib/sync/room-access.js';` and replace the room parsing and upgrade:

```js
	const roomId = parseRoomId(safeDecode(match[1]) ?? '');
	const access = parseProofProtocol(request.headers['sec-websocket-protocol']);
	if (!roomId || !access) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(request, socket, head, (ws) => {
		attachRelay(ws, roomId, access.proof);
	});
```

(delete the old `.toUpperCase()` line and its `if (!roomId)` block).

`sync-server.js`: add the same import and change the connection handler:

```js
wss.on('connection', (ws, req) => {
	ws.on('error', () => ws.terminate());
	let roomId = null;
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const match = url.pathname.match(/^\/sync\/(.+)$/);
		roomId = match ? parseRoomId(decodeURIComponent(match[1])) : null;
	} catch { /* Invalid room. */ }
	const access = parseProofProtocol(req.headers['sec-websocket-protocol']);
	if (!roomId || !access) { ws.close(1008, 'missing room'); return; }
	attachRelay(ws, roomId, access.proof);
});
```

- [ ] **Step 5: Run to verify**

Run: `npx vitest run scripts`
Expected: PASS (all four relay test files).

- [ ] **Step 6: Commit**

```bash
git add scripts
git commit -m "feat(sync): require the room proof on the node relays"
```

---

### Task 7: e2e, deployment config and docs

**Files:**
- Modify: `e2e/sync.e2e.ts` (lines 68, 178-180)
- Modify: `wrangler.toml`
- Modify: `.github/workflows/release.yml` (environment url)
- Modify: `README.md` (line 6, sync sections around lines 68-97)

**Interfaces:**
- Consumes: everything above.
- Produces: a branch that deploys as its own Worker, leaving the `kostos` Worker (old domain) untouched.

- [ ] **Step 1: Update the e2e flow**

`e2e/sync.e2e.ts`:
- `join()` goes to `${BASE}/join#${ref.secret}`.
- The wrong-key scenario (line 178): a wrong key now points at a different room, so the join page reports the group as unavailable instead of a sync error. Replace its two lines with:

```ts
		await b.goto(`${BASE}/join#${Buffer.alloc(16, 9).toString('base64url')}`);
		await b.getByText('Group data isn’t available').waitFor();
```

- [ ] **Step 2: Run e2e if a browser is available**

Run: `npm run build && npm run test:e2e`
Expected: PASS. If Chromium is not installed, say so in the commit body of the final handoff instead of skipping silently.

- [ ] **Step 3: Deploy config for the second Worker**

`wrangler.toml`: set `name = "kostos-v2"` (a new Worker with its own Durable Object namespace, so `kostos` on the old domain keeps running) and the route to the new domain:

```toml
routes = [
	{ pattern = "kostos.app", custom_domain = true }
]
```

If kostos.app is not obtained, use `kostos.fi` here and in the two places below.

`.github/workflows/release.yml`: `url: https://kostos.app`.
`README.md` line 6: point "Live demo" at `https://kostos.app`.

- [ ] **Step 4: Document the access rule**

In `README.md`, in the Cloudflare section after the sentence about `worker/index.ts`, add:

```
Rooms are addressed by a 64-character hex id derived from the group secret, and the first client to connect stores a hash of its auth proof; later connections must present the same proof. The same rule applies to the Node relays, which keep the hash in `<room>.auth` next to the room log.
```

and change both `/sync/<roomId>` mentions to `/sync/<room id>`.

- [ ] **Step 5: Final verification**

Run: `npm run check && npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add e2e wrangler.toml .github/workflows/release.yml README.md
git commit -m "chore: deploy as a separate worker on the new domain and document room access"
```

---

### Task 8: Migration banner on the old domain (separate `legacy` branch)

This runs on a branch cut from `main` before this branch merges, so the old Worker keeps the old protocol. Do it after the new domain is registered.

**Files (on `legacy`):**
- Create: `src/lib/components/MigrationBanner.svelte`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Cut the branch**

```bash
git switch main && git switch -c legacy
```

- [ ] **Step 2: Add the banner**

Create `src/lib/components/MigrationBanner.svelte` (replace the origin if the domain is `kostos.fi`):

```svelte
<script lang="ts">
	const NEW_ORIGIN = 'https://kostos.app';
</script>

<div class="migration" role="status">
	<span class="message">Kostos is moving to kostos.app. In each group open Settings and Export backup, then restore it on the new site.</span>
	<a class="action" href="{NEW_ORIGIN}/restore">Open new site</a>
</div>

<style>
	.migration {
		display: flex; align-items: center; gap: 10px; margin: 8px 12px; padding: 9px 8px 9px 12px;
		border-radius: var(--radius-sm); background: color-mix(in oklab, var(--warn) 11%, transparent);
		color: var(--ink); font-size: 13px; line-height: 1.35;
	}
	.message { flex: 1; min-width: 0; }
	.action { flex-shrink: 0; color: var(--ink); font-weight: 600; padding: 6px 8px; border-radius: 999px; text-decoration: none; }
	.action:hover, .action:focus-visible { background: color-mix(in oklab, var(--ink) 9%, transparent); }
</style>
```

In `src/routes/+layout.svelte` add `import MigrationBanner from '$lib/components/MigrationBanner.svelte';` and render `<MigrationBanner />` above `{@render children()}`.

- [ ] **Step 3: Verify and commit**

Run: `npm run check && npm test`
Expected: PASS.

```bash
git add src/lib/components/MigrationBanner.svelte src/routes/+layout.svelte
git commit -m "feat: point the old domain at the new site"
```

- [ ] **Step 4: Deploy the legacy branch to the old Worker**

From the `legacy` branch run `npm run cf:deploy` (its `wrangler.toml` still names the `kostos` Worker and the old domain). The `release.yml` workflow deploys whatever `wrangler.toml` the checked-out ref holds, so publish releases for the new site from `main` and never from `legacy`.
