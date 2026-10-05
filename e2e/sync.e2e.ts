/* Real encrypted multi-device sync against the production build. Screenshots
 * show actual network states; no application status or DOM content is mocked. */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import * as Y from 'yjs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PORT = 18_751;
const BASE = process.env.KOSTOS_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const SHOTS = fileURLToPath(new URL('../docs/screenshots/sync/', import.meta.url));
let server: ChildProcess;
let browser: Browser;
let directory: string;
const contexts: BrowserContext[] = [];
const errors: string[] = [];

const now = Date.now();
const archive = {
	schemaVersion: 2, app: 'kostos', exportedAt: now,
	project: { name: 'Lisbon Crew', emoji: '🏖', color: 'lime', currency: 'EUR', currencySymbol: '€', defaultSplit: 'even', createdAt: now, categories: [{ id: 'food', name: 'Food', emoji: '🍽️' }], paymentMethods: [], trips: [] },
	members: [{ id: 'anna', name: 'Anna', emoji: '🦊', color: 'violet', createdAt: now }, { id: 'marco', name: 'Marco', emoji: '🐼', color: 'cyan', createdAt: now }, { id: 'sofia', name: 'Sofia', emoji: '🐧', color: 'coral', createdAt: now }],
	expenses: [
		{ id: 'hotel', description: 'Hotel in Lisbon', amount: 18000, paid: 'anna' },
		{ id: 'dinner', description: 'Seafood dinner', amount: 8400, paid: 'marco' },
		{ id: 'tram', description: 'Tram tickets', amount: 3200, paid: 'sofia' }
	].map((e) => ({ id: e.id, description: e.description, amount: e.amount, payments: [{ memberId: e.paid, amount: e.amount }], currency: 'EUR', date: now, createdAt: now, createdBy: e.paid, splitMode: 'even', splits: [{ memberId: 'anna' }, { memberId: 'marco' }, { memberId: 'sofia' }] }))
};

beforeAll(async () => {
	directory = await mkdtemp(`${tmpdir()}/kostos-sync-e2e-`); await mkdir(SHOTS, { recursive: true });
	if (!process.env.KOSTOS_E2E_BASE_URL) {
	server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.js', import.meta.url))], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', KOSTOS_DATA_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
	await new Promise<void>((resolve, reject) => { server.stdout!.on('data', (d: Buffer) => { if (/listening/i.test(d.toString())) resolve(); }); server.once('exit', (code) => reject(new Error(`server exited ${code}`))); });
	}
	browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
});
afterEach(async () => { for (const context of contexts.splice(0)) await context.close(); expect(errors.splice(0)).toEqual([]); });
afterAll(async () => { await browser?.close(); server?.kill(); await rm(directory, { recursive: true, force: true }); });
async function phone(theme = 'dark') {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce', serviceWorkers: 'allow' });
	contexts.push(context);
	await context.addInitScript((value) => localStorage.setItem('kostos:theme', value), theme);
	const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
	return page;
}
async function seed(page: Page) {
	await page.goto(`${BASE}/restore`);
	await page.setInputFiles('input[type=file]', { name: 'lisbon.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
	await page.getByRole('button', { name: 'Restore on this device' }).click();
	await page.waitForURL(/\/p\/PRT-/); await synced(page);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload(); await synced(page);
	const refs = await page.evaluate(() => JSON.parse(localStorage.getItem('kostos:projects')!));
	return { roomId: refs[0].roomId as string, secret: refs[0].secret as string };
}
async function synced(page: Page) {
	try { await page.waitForSelector('[data-sync-state="synced"]', { state: 'attached', timeout: 20_000 }); }
	catch (error) {
		console.error('Sync did not finish', page.url(), await page.locator('body').innerText());
		await page.screenshot({ path: `${SHOTS}/debug-sync-failure.png` });
		throw error;
	}
}
async function join(page: Page, ref: { roomId: string; secret: string }) {
	await page.goto(`${BASE}/join?room=${ref.roomId}#${ref.secret}`);
	await page.getByRole('button', { name: /Continue as Anna/ }).click();
	await page.waitForURL(/\/p\/PRT-/); await synced(page);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload(); await synced(page);
}
async function add(page: Page, roomId: string, description: string, amount: string) {
	await page.goto(`${BASE}/p/${roomId}/add`);
	await page.fill('[aria-label="Amount, accepts math expressions"]', amount);
	await page.fill('input[placeholder="What was it for?"]', description);
	await page.click('.save-btn'); await page.waitForURL(`${BASE}/p/${roomId}`);
}
async function screenshot(page: Page, name: string) {
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openSheet(page: Page) {
	await page.locator('.sync-line').click(); await page.getByRole('dialog', { name: /./ }).waitFor();
	await page.waitForTimeout(50);
}
async function closeSheet(page: Page) {
	await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
	await page.getByRole('dialog').waitFor({ state: 'detached' });
}

async function abortLocalWrites(page: Page) {
	await page.evaluate(() => {
			const original = IDBObjectStore.prototype.add;
			(window as unknown as { abortLocalWrites: boolean }).abortLocalWrites = true;
			IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
				const request = original.apply(this, args);
				if ((window as unknown as { abortLocalWrites: boolean }).abortLocalWrites) request.addEventListener('success', () => this.transaction.abort());
				return request;
			};
		});
}

describe('mobile sync and freshness', () => {
	it('shows checking, current, offline, pending and failure states in the real app', async () => {
		const page = await phone(); const ref = await seed(page);
		await screenshot(page, '01-up-to-date-dark');
		await openSheet(page); await screenshot(page, '02-sync-details'); await closeSheet(page);
		let holdIncoming = true;
		let blockOutgoing = false;
		const incoming: (() => void)[] = [];
		await page.routeWebSocket('**/sync/**', (socket) => {
			const relay = socket.connectToServer();
			socket.onMessage((message) => { if (!blockOutgoing) relay.send(message); });
			relay.onMessage((message) => { if (holdIncoming) incoming.push(() => socket.send(message)); else socket.send(message); });
		});
		await page.reload(); await page.waitForSelector('[aria-busy="true"]');
		await screenshot(page, '03-checking');
		expect(await page.locator('.balance-amount').count()).toBe(0);
		holdIncoming = false; for (const deliver of incoming.splice(0)) deliver(); await synced(page);
		// Block WebSocket delivery while HTTP remains available, then persist an
		// expense, reload and verify that it is still awaiting confirmation.
		blockOutgoing = true;
		await add(page, ref.roomId, 'Coffee saved offline', '12');
		await screenshot(page, '04-pending-changes');
		await page.reload(); await page.waitForSelector('[data-sync-state="syncing"]', { state: 'attached' });
		expect(await page.locator('.sync-line').innerText()).toContain('Syncing 1 change');
		await page.context().setOffline(true); await page.waitForSelector('[data-sync-state="offline"]', { state: 'attached' });
		await screenshot(page, '05-offline');
		expect(await page.locator('.sync-line').innerText()).toContain('Offline');
		await openSheet(page); await screenshot(page, '10-offline-details'); await closeSheet(page);
		expect(await page.locator('.balance-amount').count()).toBe(1);
		await page.locator(`a[href="/p/${ref.roomId}/expenses"]`).click();
		expect(await page.getByText('Coffee saved offline').count()).toBeGreaterThan(0);
		await screenshot(page, '06-offline-expenses');
		await page.context().setOffline(false);
		await page.waitForSelector('[data-sync-state="error"]', { state: 'attached', timeout: 20_000 });
		await page.waitForSelector('.banner');
		await screenshot(page, '07-sync-error');
		await openSheet(page); await screenshot(page, '11-sync-error-details');
		blockOutgoing = false;
		await page.getByRole('dialog').getByRole('button', { name: 'Try again', exact: true }).click(); await synced(page);
		await page.waitForSelector('.banner', { state: 'detached' });
		const light = await phone('light'); await join(light, ref); await screenshot(light, '08-up-to-date-light');
		await openSheet(light); await screenshot(light, '17-sync-sheet-light'); await closeSheet(light);
		await light.setViewportSize({ width: 320, height: 740 });
		const line = await light.locator('.sync-line').boundingBox();
		expect(line?.x).toBeGreaterThanOrEqual(0);
		expect((line?.x ?? 0) + (line?.width ?? 0)).toBeLessThanOrEqual(320 - 22 - 36 * 2 - 6);
		expect(await light.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
		await screenshot(light, '13-narrow-phone');
	});
	it('syncs expenses in both directions and rejoins after the original sender closes', async () => {
		const a = await phone(); const ref = await seed(a); const b = await phone();
		await b.goto(`${BASE}/join?room=${ref.roomId}#${Buffer.alloc(32, 9).toString('base64url')}`);
		await b.waitForSelector('[data-sync-state="error"]', { state: 'attached' });
		await join(b, ref);
		await add(a, ref.roomId, 'Anna groceries', '18'); await synced(a);
		await b.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(b);
		expect(await b.getByText('Anna groceries').count()).toBeGreaterThan(0);
		await add(b, ref.roomId, 'Marco lunch', '24'); await synced(b);
		await a.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(a);
		expect(await a.getByText('Marco lunch').count()).toBeGreaterThan(0);
		await a.context().close(); await b.context().close();
		const c = await phone(); await join(c, ref);
		await c.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(c);
		expect(await c.getByText('Anna groceries').count()).toBeGreaterThan(0);
		expect(await c.getByText('Marco lunch').count()).toBeGreaterThan(0);
	});
	it('keeps offline edits counted once, shows both versions, and syncs a review choice', async () => {
		const a = await phone(); const ref = await seed(a); const b = await phone(); await join(b, ref);
		for (const page of [a, b]) await page.goto(`${BASE}/p/${ref.roomId}/expenses/dinner/edit`);
		for (const page of [a, b]) await page.waitForSelector('.save-btn');
		await a.context().setOffline(true); await b.context().setOffline(true);
		await a.fill('[aria-label="Amount, accepts math expressions"]', '90'); await a.click('.save-btn'); await a.waitForURL(`${BASE}/p/${ref.roomId}/expenses/dinner`);
		await b.fill('[aria-label="Amount, accepts math expressions"]', '96'); await b.click('.save-btn'); await b.waitForURL(`${BASE}/p/${ref.roomId}/expenses/dinner`);
		await a.context().setOffline(false); await b.context().setOffline(false);
		await synced(a); await synced(b);
		await a.goto(`${BASE}/p/${ref.roomId}/expenses/dinner`); await synced(a);
		await a.waitForSelector('.conflict'); await screenshot(a, '09-conflicting-edits');
		expect(await a.locator('.version').count()).toBe(2);
		await a.goto(`${BASE}/p/${ref.roomId}/expenses`); await a.waitForSelector('a.banner.review'); await a.waitForSelector('.review-dot');
		await screenshot(a, '16-review-notice');
		await a.goto(`${BASE}/p/${ref.roomId}/expenses/dinner`); await a.waitForSelector('.conflict');
		await a.locator('.version').first().click();
		await a.getByRole('button', { name: 'Keep this version' }).click();
		await synced(a); await b.goto(`${BASE}/p/${ref.roomId}/expenses/dinner`); await synced(b);
		expect(await b.locator('.conflict').count()).toBe(0);
		expect(await a.locator('.hero-amount').innerText()).toBe(await b.locator('.hero-amount').innerText());
	});
	it('reports aborted local saves, retains the form, and retries without duplicate expenses', async () => {
		const page = await phone(); const ref = await seed(page);
		await page.goto(`${BASE}/p/${ref.roomId}/add`);
		await abortLocalWrites(page);
		await page.fill('[aria-label="Amount, accepts math expressions"]', '12');
		await page.fill('input[placeholder="What was it for?"]', 'Retry after local storage failure');
		await page.click('.save-btn');
		await page.waitForSelector('[data-sync-state="local-error"]', { state: 'attached' });
		await page.getByRole('alert').filter({ hasText: 'Couldn’t save on this phone' }).waitFor();
		expect(page.url()).toContain('/add');
		await screenshot(page, '12-local-save-error');
		await page.evaluate(() => { (window as unknown as { abortLocalWrites: boolean }).abortLocalWrites = false; });
		await page.fill('[aria-label="Amount, accepts math expressions"]', '15');
		await page.click('.save-btn'); await page.waitForURL(`${BASE}/p/${ref.roomId}`); await synced(page);
		await page.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(page);
		expect(await page.getByText('Retry after local storage failure', { exact: true }).count()).toBe(1);
		await page.getByText('Retry after local storage failure', { exact: true }).click();
		expect(await page.locator('.hero-amount').innerText()).toContain('15.00');
	});
	it('commits settlement payments and deletions before completing, with safe retries', async () => {
		const page = await phone(); const ref = await seed(page);
		await page.locator('.lines .line').first().click();
		await abortLocalWrites(page);
		await page.getByRole('button', { name: 'Mark paid', exact: true }).click();
		await page.getByRole('alert').filter({ hasText: 'Couldn’t save on this phone' }).waitFor();
		expect(await page.getByRole('dialog', { name: 'Record settlement' }).count()).toBe(1);
		await screenshot(page, '14-settlement-save-error');
		await page.evaluate(() => { (window as unknown as { abortLocalWrites: boolean }).abortLocalWrites = false; });
		await page.getByRole('dialog', { name: 'Record settlement' }).getByRole('button', { name: 'Try again', exact: true }).click();
		await page.getByRole('dialog', { name: 'Record settlement' }).waitFor({ state: 'detached' }); await synced(page);
		await page.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(page);
		expect(await page.getByText('Sofia → Anna', { exact: true }).count()).toBe(1);
		await page.getByText('Seafood dinner', { exact: true }).click();
		await abortLocalWrites(page);
		await page.getByRole('button', { name: 'Delete', exact: true }).click();
		await page.getByRole('button', { name: 'Tap again to delete', exact: true }).click();
		await page.getByRole('alert').filter({ hasText: 'Couldn’t delete this on your phone' }).waitFor();
		expect(page.url()).toContain('/expenses/dinner');
		await screenshot(page, '15-deletion-save-error');
		await page.evaluate(() => { (window as unknown as { abortLocalWrites: boolean }).abortLocalWrites = false; });
		await page.getByRole('button', { name: 'Try again', exact: true }).click();
		await page.waitForURL(`${BASE}/p/${ref.roomId}/expenses`); await synced(page);
		const second = await phone(); await join(second, ref);
		await second.goto(`${BASE}/p/${ref.roomId}/expenses`); await synced(second);
		expect(await second.getByText('Seafood dinner', { exact: true }).count()).toBe(0);
		expect(await second.getByText('Sofia → Anna', { exact: true }).count()).toBe(1);
	});
	it('opens the existing y-indexeddb schema without resetting saved project data', async () => {
		const page = await phone(); await page.goto(`${BASE}/`);
		const roomId = `LEGACY-${crypto.randomUUID()}`;
		const secret = Buffer.alloc(32, 2).toString('base64url');
		const doc = new Y.Doc();
		for (const [key, value] of Object.entries({ id: roomId, ...archive.project })) {
			if (Array.isArray(value)) {
				const array = new Y.Array<Y.Map<unknown>>();
				for (const item of value) { const map = new Y.Map<unknown>(); for (const [k, v] of Object.entries(item)) map.set(k, v); array.push([map]); }
				doc.getMap('project').set(key, array);
			} else doc.getMap('project').set(key, value);
		}
		for (const member of archive.members) {
			const map = new Y.Map<unknown>(); for (const [k, v] of Object.entries(member)) map.set(k, v); doc.getArray('members').push([map]);
		}
		for (const expense of archive.expenses) {
			const map = new Y.Map<unknown>();
			for (const [key, value] of Object.entries(expense)) {
				if (Array.isArray(value)) {
					const array = new Y.Array<Y.Map<unknown>>();
					for (const item of value) { const child = new Y.Map<unknown>(); for (const [k, v] of Object.entries(item)) child.set(k, v); array.push([child]); }
					map.set(key, array);
				} else map.set(key, value);
			}
			doc.getArray('expenses').push([map]);
		}
		const update = [...Y.encodeStateAsUpdate(doc)]; doc.destroy();
		await page.evaluate(async ({ roomId, secret, update }) => {
			localStorage.setItem('kostos:projects', JSON.stringify([{ roomId, secret, name: 'Lisbon Crew' }]));
			localStorage.setItem(`kostos:member_for:${roomId}`, 'anna');
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.open(`kostos:${roomId}`);
				request.onupgradeneeded = () => { request.result.createObjectStore('updates', { autoIncrement: true }); request.result.createObjectStore('custom'); };
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const tx = request.result.transaction('updates', 'readwrite'); tx.objectStore('updates').add(new Uint8Array(update));
					tx.oncomplete = () => { request.result.close(); resolve(); }; tx.onerror = () => reject(tx.error);
				};
			});
		}, { roomId, secret, update });
		await page.goto(`${BASE}/p/${roomId}`); await synced(page);
		expect(await page.locator('.project-name').innerText()).toContain('Lisbon Crew');
		await page.goto(`${BASE}/p/${roomId}/people`); await synced(page);
		expect(await page.getByText('Anna', { exact: true }).count()).toBeGreaterThan(0);
		expect(await page.getByText('Marco', { exact: true }).count()).toBeGreaterThan(0);
		await page.goto(`${BASE}/p/${roomId}/expenses`); await synced(page);
		expect(await page.getByText('Seafood dinner', { exact: true }).count()).toBe(1);
	});

});
