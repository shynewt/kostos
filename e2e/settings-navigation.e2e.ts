/* The Group tab in a real browser: rows with live summaries, categories and payment methods on
 * their own pages, the payment methods row following the tracking switch, member sheets, and the
 * header's switcher link and sync button. Needs `npm run build` first. Set PLAYWRIGHT_CHROMIUM_PATH to use
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
	await page.getByRole('button', { name: /live demo/ }).click();
	await page.waitForURL(/\/p\/DEMO$/);
});

afterEach(async () => {
	await page.context().close();
});

const row = (name: string) => page.getByRole('link', { name: new RegExp(`^${name}`) });
const summary = async (name: string) => (await row(name).locator('.row-value').textContent())?.trim();
const trackingSwitch = () => page.getByRole('switch', { name: 'Track payment methods' });
const memberRow = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}( \\(you\\))?$`) });

async function openSettings(): Promise<void> {
	await page.goto(`${BASE}/p/DEMO/settings`);
	await page.getByRole('heading', { level: 1 }).waitFor();
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
		await expect(trackingSwitch().getAttribute('aria-checked')).resolves.toBe('true');

		await trackingSwitch().click();
		await expect(trackingSwitch().getAttribute('aria-checked')).resolves.toBe('false');
		await expect(row('Payment methods').count()).resolves.toBe(0);

		await page.waitForTimeout(500);
		await page.goto(`${BASE}/p/DEMO/settings/payment-methods`);
		await page.getByText(/Payment methods are off/).waitFor();

		await openSettings();
		await trackingSwitch().click();
		await expect(trackingSwitch().getAttribute('aria-checked')).resolves.toBe('true');
		await expect(row('Payment methods').count()).resolves.toBe(1);
	});
});

describe('group tab', () => {
	const groupTab = () => page.locator('.tabbar').getByRole('link', { name: 'GROUP' });

	it('redirects the old people page to the group tab and marks the tab active', async () => {
		await page.goto(`${BASE}/p/DEMO/people`);
		await page.waitForURL(/\/p\/DEMO\/settings$/);
		await page.getByRole('heading', { level: 1 }).waitFor();
		await expect(groupTab().getAttribute('class')).resolves.toMatch(/\bactive\b/);

		await row('Categories').click();
		await page.waitForURL(/\/settings\/categories$/);
		await expect(groupTab().getAttribute('class')).resolves.toMatch(/\bactive\b/);
	});

	it('switches the current member from a member sheet', async () => {
		await openSettings();
		await memberRow('Alice').waitFor();
		await expect(memberRow('Alice').textContent()).resolves.toContain('(you)');

		await memberRow('Bob').click();
		const sheet = page.getByRole('dialog', { name: 'Bob' });
		await sheet.getByRole('button', { name: 'This is me' }).click();
		await sheet.waitFor({ state: 'detached' });

		await expect(memberRow('Bob').textContent()).resolves.toContain('(you)');
		await expect(memberRow('Alice').textContent()).resolves.not.toContain('(you)');

		await page.reload();
		await memberRow('Bob').waitFor();
		await expect(memberRow('Bob').textContent()).resolves.toContain('(you)');

		await memberRow('Alice').click();
		await expect(page.getByRole('dialog', { name: 'Alice' }).getByRole('button', { name: 'This is me' }).count()).resolves.toBe(1);
	});

	it('adds a member from the add member sheet', async () => {
		await openSettings();
		const before = await page.getByRole('heading', { name: /^Members/ }).textContent();
		expect(before).toContain('4');

		await page.getByRole('button', { name: 'Add member' }).click();
		const sheet = page.getByRole('dialog', { name: 'Add member' });
		await sheet.getByLabel('Name').fill('Erin');
		await sheet.getByRole('button', { name: 'Add', exact: true }).click();
		await sheet.getByRole('status').filter({ hasText: 'Added Erin' }).waitFor();
		await sheet.getByRole('button', { name: 'Done' }).click();
		await sheet.waitFor({ state: 'detached' });

		await memberRow('Erin').waitFor();
		await expect(page.getByRole('heading', { name: /^Members/ }).textContent()).resolves.toContain('5');
		await expect(page.getByRole('link', { name: /people\. Switch group$/ }).getAttribute('aria-label')).resolves.toContain('5 people');
	});

	it('renames a member and asks before removing one', async () => {
		await openSettings();
		await memberRow('Dan').click();
		let sheet = page.getByRole('dialog', { name: 'Dan' });
		await sheet.getByRole('button', { name: 'Rename' }).click();
		await sheet.getByLabel('Name').fill('Daniel');
		await sheet.getByRole('button', { name: 'Save' }).click();
		sheet = page.getByRole('dialog', { name: 'Daniel' });
		await sheet.waitFor();

		await sheet.getByRole('button', { name: 'Remove from group' }).click();
		await sheet.getByText(/Removing them keeps the history|from the group\?/).waitFor();
		await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
		await sheet.waitFor({ state: 'detached' });
		await expect(memberRow('Daniel').count()).resolves.toBe(0);
	});

	it('gives the header one switcher link and a sync button', async () => {
		await page.goto(`${BASE}/p/DEMO`);
		const header = page.locator('header.app-bar');
		await header.getByRole('button', { name: 'Sync status: Only on this phone' }).waitFor();

		await expect(header.getByRole('link').count()).resolves.toBe(1);
		const switcher = header.getByRole('link', { name: 'Sample group, 4 people. Switch group' });
		await expect(switcher.getAttribute('href')).resolves.toBe('/');
		await expect(header.getByRole('link', { name: 'Group settings' }).count()).resolves.toBe(0);

		await header.getByRole('button', { name: /^Sync status:/ }).click();
		await page.getByRole('dialog', { name: 'Only on this phone' }).waitFor();
		await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
		await page.getByRole('dialog').waitFor({ state: 'detached' });

		await switcher.click();
		await page.waitForURL(`${BASE}/`);
	});
});
