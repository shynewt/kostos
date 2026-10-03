/* Expense form scenarios in a real browser against the production build, so the Svelte
 * wiring is covered and not just the pure money logic. Needs `npm run build` first. Set
 * PLAYWRIGHT_CHROMIUM_PATH to use a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page, type Route } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_741;
const BASE = `http://127.0.0.1:${PORT}`;
const FX_API = '**/open.er-api.com/**';

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

// fresh context per test: no rate cache or demo data carried over
beforeEach(async () => {
	const context = await browser.newContext();
	page = await context.newPage();
	await page.goto(`${BASE}/`);
	await page.click('.demo-cta');
	await page.waitForURL(/\/p\/DEMO$/);
});

afterEach(async () => {
	await page.context().close();
});

function fxResponse(rate: number) {
	return { status: 200, contentType: 'application/json', body: JSON.stringify({ result: 'success', rates: { EUR: rate } }) };
}

async function openAddForm(): Promise<void> {
	await page.goto(`${BASE}/p/DEMO/add`);
	await page.waitForSelector('[aria-label="Amount, accepts math expressions"]');
}

async function pickCurrency(code: string): Promise<void> {
	await page.click('.currency-chip');
	await page.fill('[aria-label="Search currencies"]', code);
	await page.locator('.currency-row', { hasText: code }).first().click();
}

const amountInput = () => page.locator('[aria-label="Amount, accepts math expressions"]');
const chargedInput = () => page.locator('[aria-label="Amount charged in EUR"]');
const delta = () => page.locator('.fx-delta');

async function saveAndOpen(title: string): Promise<string> {
	await page.fill('input[placeholder="What was it for?"]', title);
	await page.click('.save-btn');
	await page.waitForURL(/\/p\/DEMO$/);
	await page.goto(`${BASE}/p/DEMO/expenses`);
	await page.getByText(title).first().click();
	await page.waitForURL(/\/expenses\/[^/]+$/);
	return page.url();
}

describe('exchange rate', () => {
	it('keeps a charged amount typed while the market rate is still loading', async () => {
		let release!: () => void;
		const held = new Promise<void>((resolve) => (release = resolve));
		let fetchStarted!: () => void;
		const started = new Promise<void>((resolve) => (fetchStarted = resolve));
		await page.route(FX_API, async (route: Route) => {
			fetchStarted();
			await held;
			await route.fulfill(fxResponse(0.92));
		});

		await openAddForm();
		await amountInput().fill('10');
		await pickCurrency('USD');
		await started;
		await chargedInput().fill('8.00');
		release();
		await expect.poll(() => page.locator('.fx-status').innerText()).toContain('Market 1 USD = 0.92 EUR');

		expect(await chargedInput().inputValue()).toBe('8.00');
		expect(await delta().innerText()).toBe('−13.0%');
	});

	it('defaults to the market value and follows the amount until a charge is typed', async () => {
		await page.route(FX_API, (route) => route.fulfill(fxResponse(0.9)));
		await openAddForm();
		await amountInput().fill('10');
		await pickCurrency('USD');
		await expect.poll(() => chargedInput().inputValue()).toBe('9.00');
		expect(await delta().innerText()).toBe('market');

		await amountInput().fill('20');
		await expect.poll(() => chargedInput().inputValue()).toBe('18.00');

		await chargedInput().fill('18.90');
		await amountInput().fill('30');
		expect(await chargedInput().inputValue()).toBe('18.90');

		await page.getByText('Use market rate').click();
		await expect.poll(() => chargedInput().inputValue()).toBe('27.00');
	});

	it('keeps what the bank charged through save, reopen and an amount edit, and reports the fee', async () => {
		await page.route(FX_API, (route) => route.fulfill(fxResponse(0.9213)));
		await openAddForm();
		await amountInput().fill('100');
		await pickCurrency('USD');
		await expect.poll(() => chargedInput().inputValue()).toBe('92.13');
		await chargedInput().fill('94.20');
		expect(await delta().innerText()).toBe('+2.2%');
		const detailUrl = await saveAndOpen('E2E card dinner');

		await expect.poll(() => page.locator('.hero-fee').innerText()).toContain('(2.2%) above the market rate of 0.9213');

		await page.goto(`${detailUrl}/edit`);
		expect(await chargedInput().inputValue()).toBe('94.20');
		await amountInput().fill('120');
		expect(await chargedInput().inputValue()).toBe('94.20');
		await page.click('.save-btn');
		await page.waitForURL(detailUrl);
		await expect.poll(() => page.locator('.hero-fx').innerText()).toContain('= €94.20');

		await page.goto(`${BASE}/p/DEMO/stats`);
		// pinned at €94.20 while $120 is worth €110.56 at market: the card beat the market
		await expect.poll(() => page.locator('.fee-tile').innerText()).toMatch(/exchange fees/i);
		expect(await page.locator('.fee-value').innerText()).toBe('−€16.36');
		expect(await page.locator('.fee-tile .stat-sub').innerText()).toContain('14.8% below the market rate on 1');
	});

	it('shows what a rounded charged amount is saved as', async () => {
		await page.route(FX_API, (route) => route.fulfill(fxResponse(0.9)));
		await openAddForm();
		await amountInput().fill('1');
		await pickCurrency('USD');
		await chargedInput().fill('1.234');
		await expect.poll(() => page.locator('.fx-status').innerText()).toContain('Saved as 1.23 EUR.');
	});
});

describe('rounding notes', () => {
	beforeEach(async () => {
		await page.route(FX_API, (route) => route.abort());
		await openAddForm();
		await amountInput().fill('2.47');
		await pickCurrency('KWD');
		await chargedInput().fill('7.41');
	});

	it('flags exact-split rows that round in opposite directions', async () => {
		await page.locator('.split-tab', { hasText: 'Amounts' }).click();
		const rows = page.locator('input[aria-label^="Amount for"]');
		await rows.nth(0).fill('1.234');
		await rows.nth(1).fill('1.236');
		const notes = await page.locator('.rounding-note').allInnerTexts();
		expect(notes).toEqual(expect.arrayContaining(['Saved as 1.23', 'Saved as 1.24']));
	});

	it('flags paid-by rows that round', async () => {
		await page.getByText('Add another payer').first().click();
		const rows = page.locator('input[aria-label^="Amount paid by"]');
		await rows.nth(0).fill('1.234');
		await rows.nth(1).fill('1.236');
		const notes = await page.locator('.rounding-note').allInnerTexts();
		expect(notes).toEqual(expect.arrayContaining(['Saved as 1.23', 'Saved as 1.24']));
	});
});

describe('validation message timing', () => {
	it('waits for the latest edit before showing a problem, while Save disables at once', async () => {
		await openAddForm();
		await page.fill('input[placeholder="What was it for?"]', 'E2E timing');
		await amountInput().fill('1+');
		expect(await page.locator('.save-btn').isDisabled()).toBe(true);
		await page.waitForTimeout(550);
		await amountInput().fill('1+(');
		await page.waitForTimeout(350);
		expect(await page.locator('.save-problem').count()).toBe(0);
		await page.waitForTimeout(700);
		expect(await page.locator('.save-problem').innerText()).toContain("isn't a valid number");
	});
});
