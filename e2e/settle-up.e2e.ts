/* Group home in a real browser: the balance breakdown adds up to the balance shown, and the
 * settle sheet records partial payments. Needs `npm run build` first. Set
 * PLAYWRIGHT_CHROMIUM_PATH to use a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_745;
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
});

afterEach(async () => {
	await page.context().close();
});

function toCents(text: string): number {
	const negative = text.includes('−');
	const digits = text.replace(/[^\d]/g, '');
	return (negative ? -1 : 1) * Number(digits);
}

const homeBalanceCents = async () => toCents(await page.locator('.balance-amount').innerText());
const settleDialog = () => page.getByRole('dialog', { name: 'Record settlement' });
const markPaid = () => settleDialog().getByRole('button', { name: 'Mark paid', exact: true });
const amountInput = () => settleDialog().getByLabel('Amount, accepts math expressions');

describe('balance breakdown', () => {
	it('lists parts that add up to the balance on the home screen', async () => {
		const balance = await homeBalanceCents();
		await page.getByRole('button', { name: /How your balance adds up/ }).click();
		const dialog = page.getByRole('dialog', { name: 'How your balance adds up' });
		await dialog.waitFor();

		const parts = (await dialog.locator('.sum-row:not(.sum-result) dd').allInnerTexts()).map(toCents);
		// the demo has no settlements paid by you, so that zero row is left out
	expect(parts).toHaveLength(3);
	expect(await dialog.getByText('You paid back').count()).toBe(0);
		const result = toCents(await dialog.locator('.sum-result dd').innerText());
		// the home screen shows the balance unsigned, under "You're owed" or "You owe"
		expect(Math.abs(parts.reduce((total, part) => total + part, 0))).toBe(balance);
		expect(result).toBe(balance);

		await page.keyboard.press('Escape');
		await dialog.waitFor({ state: 'detached' });
	});
});

describe('settle sheet', () => {
	it('records a partial payment and leaves the rest owed', async () => {
		// in the demo the first row is someone paying you, so a payment shrinks what you're owed
		const balance = await homeBalanceCents();
		const firstRow = page.locator('.lines .line').first();
		const owed = toCents(await firstRow.locator('.line-amount').innerText());
		await firstRow.click();
		await settleDialog().waitFor();
		expect(toCents(await amountInput().inputValue())).toBe(owed);

		await amountInput().fill('10');
		await markPaid().click();
		await settleDialog().waitFor({ state: 'detached' });

		await expect.poll(homeBalanceCents).toBe(balance - 1000);
	});

	it('refuses amounts that are empty, zero or more than owed', async () => {
		const firstRow = page.locator('.lines .line').first();
		const owed = toCents(await firstRow.locator('.line-amount').innerText());
		await firstRow.click();
		await settleDialog().waitFor();

		await amountInput().fill('');
		expect(await markPaid().isDisabled()).toBe(true);
		await amountInput().fill('0');
		expect(await markPaid().isDisabled()).toBe(true);
		await amountInput().fill(((owed + 1) / 100).toFixed(2));
		await settleDialog().getByRole('alert').filter({ hasText: 'more than is owed' }).waitFor();
		expect(await markPaid().isDisabled()).toBe(true);

		await amountInput().fill((owed / 100).toFixed(2));
		expect(await markPaid().isDisabled()).toBe(false);
	});
});
