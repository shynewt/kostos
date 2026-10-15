/* Group split default in a real browser: the settings card writes the setting and the new
 * expense form picks it up. Needs `npm run build` first. Set PLAYWRIGHT_CHROMIUM_PATH to use
 * a Chromium other than the one Playwright downloaded. */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PORT = 18_742;
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

const modeButton = (label: string) => page.getByRole('radio', { name: new RegExp(label) });

async function openSettings(): Promise<void> {
	await page.goto(`${BASE}/p/DEMO/settings`);
	await page.waitForSelector('[aria-label="Default split for new expenses"]');
}

// local persistence flushes asynchronously; a hard reload right after a change would race it
async function openAddForm(): Promise<void> {
	await page.waitForTimeout(500);
	await page.goto(`${BASE}/p/DEMO/add`);
	await page.waitForSelector('[aria-label="Amount, accepts math expressions"]');
}

const activeSplitTab = () => page.locator('.split-tab.on .split-tab-label');
const shareValues = () => page.locator('.shares-controls .share-value');

describe('group split default', () => {
	it('starts even and the new expense form does too', async () => {
		await openSettings();
		await expect(modeButton('Evenly').getAttribute('aria-checked')).resolves.toBe('true');
		await openAddForm();
		await expect(activeSplitTab().textContent()).resolves.toBe('Evenly');
	});

	it('seeds the new expense from the fixed ratio and still lets it be changed', async () => {
		await openSettings();
		await modeButton('Fixed ratio').click();
		await page.getByRole('button', { name: /^Increase .*share$/ }).first().click();
		await page.getByRole('button', { name: /^Increase .*share$/ }).first().click();

		await openAddForm();
		await expect(activeSplitTab().textContent()).resolves.toBe('Shares');
		await expect(shareValues().first().textContent()).resolves.toBe('3');
		expect(await shareValues().allTextContents()).toContain('1');

		await page.locator('.split-tab', { hasText: 'Evenly' }).click();
		await expect(activeSplitTab().textContent()).resolves.toBe('Evenly');
	});

	it('goes back to an even split when switched back', async () => {
		await openSettings();
		await modeButton('Fixed ratio').click();
		await page.getByRole('button', { name: /^Increase .*share$/ }).first().click();
		await modeButton('Evenly').click();
		await openAddForm();
		await expect(activeSplitTab().textContent()).resolves.toBe('Evenly');
	});

	it('reuses the split of the last expense the member added', async () => {
		await openSettings();
		await modeButton('My last split').click();

		await openAddForm();
		await expect(activeSplitTab().textContent()).resolves.toBe('Evenly');

		await page.locator('.split-tab', { hasText: 'Shares' }).click();
		await page.getByRole('button', { name: 'Increase shares' }).first().click();
		await page.getByRole('button', { name: 'Increase shares' }).first().click();
		await page.fill('[aria-label="Amount, accepts math expressions"]', '30');
		await page.fill('input[placeholder="What was it for?"]', 'Split default check');
		await page.click('.save-btn');
		await page.waitForURL(/\/p\/DEMO$/);

		await openAddForm();
		await expect(activeSplitTab().textContent()).resolves.toBe('Shares');
		await expect(shareValues().first().textContent()).resolves.toBe('3');
	});
});
