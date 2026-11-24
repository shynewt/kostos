/* Stats screen in a real browser: the period sheet, the "Just me" view and drilling from a
 * category into the expense list. Needs `npm run build` first. Set PLAYWRIGHT_CHROMIUM_PATH
 * to use a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_753;
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
	await page.getByRole('button', { name: /live demo/ }).click();
	await page.waitForURL(/\/p\/DEMO$/);
	await page.locator('.balance-amount').waitFor();
	await page.goto(`${BASE}/p/DEMO/stats`);
	await page.locator('.hero-amount').waitFor();
});

afterEach(async () => {
	await page.context().close();
});

const heroAmount = () => page.locator('.hero-amount').innerText();
const periodChip = () => page.getByRole('button', { name: /^Period:/ });
const periodSheet = () => page.getByRole('dialog', { name: 'Show spending for' });
const aliceRow = () => page.locator('.person-row', { hasText: 'Alice' });

describe('stats', () => {
	it('totals the demo without its settlement', async () => {
		// ten expenses add up to €1,729.45; the €60 settlement from Bob is left out
		expect(await heroAmount()).toBe('€1,729.45');
		expect(await page.locator('.hero-line').innerText()).toMatch(/^Spent on 10 expenses/);
		expect(await page.getByText('Settlements aren’t counted.').count()).toBe(1);
	});

	it('narrows to one calendar month from the period sheet and back to all time', async () => {
		await periodChip().click();
		await periodSheet().getByRole('button', { name: 'May 2026' }).click();
		await expect.poll(() => periodChip().getAttribute('aria-label')).toBe('Period: May 2026');
		expect(page.url()).toContain('period=2026-05');
		expect(await heroAmount()).toBe('€1,129.75');
		expect(await page.locator('.hero-line').innerText()).toMatch(/^Spent on 5 expenses/);
		expect(await page.locator('.spend-size').innerText()).toMatch(/by day/i);

		await periodChip().click();
		await periodSheet().getByRole('button', { name: 'All time' }).click();
		await expect.poll(heroAmount).toBe('€1,729.45');
	});

	it('captions the busiest period, then whichever bar is tapped', async () => {
		const caption = page.locator('.spend-caption');
		expect(await caption.innerText()).toMatch(/^Busiest: Week of/);
		const bars = page.locator('.spend-col');
		await bars.first().click();
		await expect.poll(() => caption.innerText()).not.toMatch(/^Busiest/);
		expect(await bars.first().getAttribute('aria-pressed')).toBe('true');
		expect(await caption.innerText()).toContain(await bars.first().getAttribute('aria-label').then((label) => label!.split(': ')[1]));
	});

	it('shows an empty state for a month with no spending and offers all time', async () => {
		await periodChip().click();
		await periodSheet().getByRole('button', { name: /^This month/ }).click();
		await expect.poll(() => page.locator('.empty-card').innerText()).toMatch(/Nothing spent in \w+ \d{4}/);
		await page.getByRole('button', { name: 'Show all time' }).click();
		await expect.poll(heroAmount).toBe('€1,729.45');
	});

	it('switches to Just me and totals exactly my share', async () => {
		const shareText = await aliceRow().locator('.person-meta').innerText();
		const myShare = shareText.match(/Share (€[\d,.]+)/)?.[1];
		expect(myShare).toBe('€475.48');

		await page.getByRole('button', { name: 'Just me' }).click();
		await expect.poll(heroAmount).toBe(myShare);
		expect(await page.locator('.hero-line').innerText()).toMatch(/^Your share of 9 expenses/);
		expect(await page.locator('.person-row').count()).toBe(0);
		expect(page.url()).toContain('view=me');
	});

	it('opens the expense list filtered to a category and the selected trip', async () => {
		await page.getByRole('tab', { name: /Berlin trip/ }).click();
		await expect.poll(heroAmount).toBe('€1,087.75');
		await page.getByRole('link', { name: /^Lodging/ }).click();
		await page.waitForURL(/\/expenses\?category=cat-lodging$/);

		const removeFilter = page.getByRole('button', { name: /^Remove filter: .*Lodging$/ });
		await removeFilter.waitFor();
		await expect.poll(() => page.locator('.expense-row').count()).toBe(1);
		expect(await page.locator('.expense-row').innerText()).toContain('Airbnb 3 nights');

		await removeFilter.click();
		await expect.poll(() => page.url()).not.toContain('category=');
		await expect.poll(() => page.locator('.expense-row').count()).toBe(4);
	});
});
