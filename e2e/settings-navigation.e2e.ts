/* Settings navigation in a real browser: the home page lists short rows with live summaries,
 * categories and payment methods live on their own pages, and the payment methods row follows
 * the tracking switch. Needs `npm run build` first. Set PLAYWRIGHT_CHROMIUM_PATH to use
 * a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_744;
const BASE = `http://127.0.0.1:${PORT}`;

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
	await page.goto(`${BASE}/`);
	await page.click('.demo-cta');
	await page.waitForURL(/\/p\/DEMO$/);
});

afterEach(async () => {
	await page.context().close();
});

const row = (name: string) => page.getByRole('link', { name: new RegExp(`^${name}`) });
const summary = async (name: string) => (await row(name).locator('.nav-summary').textContent())?.trim();

async function openSettings(): Promise<void> {
	await page.goto(`${BASE}/p/DEMO/settings`);
	await page.waitForSelector('.project-block');
}

describe('settings navigation', () => {
	it('lists categories, trips and payment methods as rows with counts', async () => {
		await openSettings();
		for (const name of ['Categories', 'Trips', 'Payment methods']) {
			expect(await summary(name)).toMatch(/^\d+$/);
		}
		await expect(page.locator('.editor-card').count()).resolves.toBe(0);
		await expect(row('Members').count()).resolves.toBe(0);
	});

	it('edits categories on their own page and reflects the count back on settings', async () => {
		await openSettings();
		const before = Number(await summary('Categories'));

		await row('Categories').click();
		await page.waitForURL(/\/settings\/categories$/);
		await page.fill('[aria-label="New name"]', 'Pets');
		await page.click('.editor-add-btn');
		await page.waitForSelector('[aria-label="Pets name"]');

		await page.getByRole('link', { name: 'Back' }).click();
		await page.waitForURL(/\/settings$/);
		expect(Number(await summary('Categories'))).toBe(before + 1);
	});

	it('edits payment methods on their own page', async () => {
		await openSettings();
		await row('Payment methods').click();
		await page.waitForURL(/\/settings\/payment-methods$/);
		await page.fill('[aria-label="New name"]', 'Voucher');
		await page.click('.editor-add-btn');
		await page.waitForSelector('[aria-label="Voucher name"]');
	});

	it('hides the payment methods row while tracking is off and brings it back', async () => {
		await openSettings();
		const toggle = page.getByRole('button', { name: /Track payment method/ });

		await toggle.click();
		await expect(row('Payment methods').count()).resolves.toBe(0);

		await page.waitForTimeout(500);
		await page.goto(`${BASE}/p/DEMO/settings/payment-methods`);
		await page.getByText(/Payment methods are off/).waitFor();

		await openSettings();
		await page.getByRole('button', { name: /Track payment method/ }).click();
		await expect(row('Payment methods').count()).resolves.toBe(1);
	});
});
