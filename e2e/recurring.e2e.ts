/* Repeating expenses in a real browser against the production build. Needs `npm run build`
 * first. Set PLAYWRIGHT_CHROMIUM_PATH to use a Chromium other than Playwright's own. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_744;
const BASE = `http://127.0.0.1:${PORT}`;
const TITLE = 'Studio rent';

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
	const context = await browser.newContext();
	page = await context.newPage();
	await page.goto(`${BASE}/`);
	await page.getByRole('button', { name: /live demo/ }).click();
	await page.waitForURL(/\/p\/DEMO$/);
});

afterEach(async () => {
	await page.context().close();
});

// two months back on a day every month has, so exactly two copies are due today
function twoMonthsAgo(): string {
	const now = new Date();
	const day = Math.min(now.getUTCDate(), 28);
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, day)).toISOString().slice(0, 10);
}

const rentRows = () => page.locator('.expense-row', { hasText: TITLE });

async function addMonthlyRent(): Promise<void> {
	await page.goto(`${BASE}/p/DEMO/add`);
	await page.locator('[aria-label="Amount, accepts math expressions"]').fill('900');
	await page.getByLabel('What for?', { exact: true }).fill(TITLE);
	await page.getByRole('button', { name: /^Date:/ }).click();
	await page.locator('input[type="date"]').fill(twoMonthsAgo());
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('button', { name: 'Make this repeat' }).click();
	await page.getByRole('button', { name: 'Monthly', exact: true }).click();
	await expect.poll(() => page.locator('.repeat-hint').innerText()).toContain('Every month on day');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.click('.save-btn');
	await page.waitForURL(/\/p\/DEMO$/);
}

describe('repeating expenses', () => {
	it('adds the missed monthly copies once, marked as repeating', async () => {
		await addMonthlyRent();
		await page.goto(`${BASE}/p/DEMO/expenses`);
		await expect.poll(() => rentRows().count()).toBe(3);
		await expect.poll(() => rentRows().locator('[aria-label="Repeats"]').count()).toBe(3);

		await page.reload();
		await page.waitForSelector('.expense-row');
		await expect.poll(() => rentRows().count()).toBe(3);
	});

	it('keeps a deleted copy deleted and stops on request', async () => {
		await addMonthlyRent();
		await page.goto(`${BASE}/p/DEMO/expenses`);
		await expect.poll(() => rentRows().count()).toBe(3);

		await rentRows().first().click();
		await page.waitForURL(/\/expenses\/[^/]+$/);
		await page.getByRole('button', { name: 'Delete' }).click();
		await page.waitForURL(/\/expenses$/);
		await page.reload();
		await page.waitForSelector('.expense-row');
		await expect.poll(() => rentRows().count()).toBe(2);

		await rentRows().first().click();
		await expect.poll(() => page.getByTestId('repeat-card').innerText()).toContain('Repeats monthly');
		await page.getByRole('button', { name: 'Stop repeating' }).click();
		await expect.poll(() => page.locator('.repeat-stopped').innerText()).toContain('Repeated monthly until');

		await page.goto(`${BASE}/p/DEMO/expenses`);
		await expect.poll(() => rentRows().count()).toBe(2);
		// saved data can load in more than one step, so the marks settle a moment after the rows
		await expect.poll(() => rentRows().locator('[aria-label="Repeats"]').count()).toBe(0);
	});
});
