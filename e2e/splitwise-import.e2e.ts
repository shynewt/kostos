/* Splitwise import in a real browser: a CSV export picked on the new-group page becomes a
 * group whose balances match the file. Needs `npm run build` first. Set
 * PLAYWRIGHT_CHROMIUM_PATH to use a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_752;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURES = new URL('../src/lib/import/fixtures/', import.meta.url);

let server: ChildProcess;
let browser: Browser;
let page: Page;

beforeAll(async () => {
	if (!existsSync(fileURLToPath(new URL('../build/200.html', import.meta.url)))) {
		throw new Error('no production build; run `npm run build` before `npm run test:e2e`');
	}
	server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.js', import.meta.url))], {
		env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	await new Promise<void>((resolve, reject) => {
		server.stdout!.on('data', (chunk: Buffer) => {
			if (/listening/i.test(chunk.toString())) resolve();
		});
		server.once('exit', (code) => reject(new Error(`serve.js exited with ${code}`)));
	});
	browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
});

afterAll(async () => {
	await browser?.close();
	server?.kill();
});

beforeEach(async () => {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	page = await context.newPage();
	await page.goto(`${BASE}/new`);
});

afterEach(async () => {
	await page.context().close();
});

const pickFile = (name: string) => page.getByLabel('Splitwise CSV file').setInputFiles(fileURLToPath(new URL(name, FIXTURES)));

describe('Splitwise import', () => {
	it('creates a group with the balances from the export', async () => {
		await page.getByRole('link', { name: 'Import a CSV' }).click();
		await page.waitForURL(/\/import\/splitwise$/);
		await pickFile('splitwise-flat.csv');

		expect(await page.getByLabel('Group name').inputValue()).toBe('Splitwise flat');
		const balances = page.getByLabel('Balances after import');
		expect(await balances.locator('.balance-value').allInnerTexts()).toEqual(['+€55.77', '+€0.47', '−€56.24']);

		const create = page.getByRole('button', { name: 'Create group' });
		expect(await create.isDisabled()).toBe(true);
		await page.getByLabel('Group name').fill('Flat share');
		await page.getByRole('radio', { name: /Carol/ }).click();
		await create.click();

		await page.waitForURL(/\/p\/[^/]+$/);
		await page.locator('.balance-amount').waitFor();
		expect(await page.locator('.balance-eyebrow').innerText()).toMatch(/you owe/i);
		expect(await page.locator('.balance-amount').innerText()).toBe('€56.24');
		expect(await page.title()).toBe('Flat share · Kostos');
	});

	it('asks for a rate for each extra currency before showing balances', async () => {
		await page.goto(`${BASE}/import/splitwise`);
		await pickFile('splitwise-trip.csv');
		expect(await page.getByLabel('Balances after import').count()).toBe(0);
		await page.getByLabel('1 JPY =').fill('0.006');
		await page.getByLabel('1 USD =').fill('0.9');
		expect(await page.getByLabel('Balances after import').locator('.balance-value').allInnerTexts()).toEqual(['+€139.50', '−€92.50', '−€47.00']);
	});

	it('explains when the file is not a Splitwise export', async () => {
		await page.goto(`${BASE}/import/splitwise`);
		await page.getByLabel('Splitwise CSV file').setInputFiles({ name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('name,amount\nAlice,10\n') });
		await page.getByText('This doesn’t look like a Splitwise export.', { exact: false }).waitFor();
	});
});
