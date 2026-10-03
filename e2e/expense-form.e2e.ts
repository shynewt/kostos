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
const rateInput = () => page.locator('[aria-label="Exchange rate to EUR"]');
const chargedInput = () => page.locator('[aria-label="Amount charged in EUR"]');

describe('exchange rate', () => {
	it('keeps a typed rate when an automatic fetch resolves afterwards', async () => {
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
		await rateInput().fill('0.8');
		release();
		await page.waitForTimeout(500);

		expect(await rateInput().inputValue()).toBe('0.8');
		expect(await chargedInput().inputValue()).toBe('8.00');
	});

	it('reopens a typed rate exactly, so changing $3 to $6 gives €2.00', async () => {
		await page.route(FX_API, (route) => route.fulfill(fxResponse(0.9)));
		await openAddForm();
		await amountInput().fill('3');
		await pickCurrency('USD');
		await rateInput().fill('0.3333333333333333');
		await page.fill('input[placeholder="What was it for?"]', 'E2E ferry');
		await page.click('.save-btn');
		await page.waitForURL(/\/p\/DEMO$/);

		await page.goto(`${BASE}/p/DEMO/expenses`);
		await page.getByText('E2E ferry').first().click();
		await page.waitForURL(/\/expenses\/[^/]+$/);
		const detailUrl = page.url();

		await page.goto(`${detailUrl}/edit`);
		await amountInput().fill('6');
		expect(await chargedInput().inputValue()).toBe('2.00');
		await page.click('.save-btn');
		await page.waitForURL(detailUrl);
		await expect.poll(() => page.locator('.hero-fx').innerText()).toContain('€2.00');
	});

	it('shows what a rounded charged amount is saved as', async () => {
		await page.route(FX_API, (route) => route.fulfill(fxResponse(0.9)));
		await openAddForm();
		await amountInput().fill('1');
		await pickCurrency('USD');
		await chargedInput().fill('1.234');
		await expect.poll(() => page.locator('.rate-note').innerText()).toContain('Saved as 1.23 EUR.');
	});
});

describe('rounding notes', () => {
	beforeEach(async () => {
		await page.route(FX_API, (route) => route.abort());
		await openAddForm();
		await amountInput().fill('2.47');
		await pickCurrency('KWD');
		await rateInput().fill('3');
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
