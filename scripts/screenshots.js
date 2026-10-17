/* Capture README screenshots via Playwright.
 *
 * Drives a fresh iPhone-emulated browser context against a running server (dev on :5173, or
 * point SCREENSHOT_BASE_URL at `npm run preview`), restores a deterministic sample project via
 * the import flow, then walks the key screens. Outputs to docs/screenshots/.
 *
 * Run: npm run screenshots   (a server must be running; defaults to :5173)
 *   or: SCREENSHOT_BASE_URL=http://localhost:4173 node scripts/screenshots.js
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'docs', 'screenshots');
const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:5173';

const DAY_MS = 86_400_000;
const now = Date.now();
const day = (offsetDays) => now + offsetDays * DAY_MS;

const archive = {
	schemaVersion: 2,
	app: 'kostos',
	exportedAt: now,
	project: {
		name: 'Lisbon Crew',
		description: 'Friends & flatmates',
		emoji: '🏖',
		color: 'lime',
		currency: 'EUR',
		currencySymbol: '€',
		defaultSplit: 'even',
		// off so the multi-currency screenshot uses a typed rate instead of a live fetch
		autoFetchRates: false,
		createdAt: day(-180),
		categories: [
			{ id: 'cat-groceries', name: 'Groceries', emoji: '🛒' },
			{ id: 'cat-restaurants', name: 'Restaurants', emoji: '🍽️' },
			{ id: 'cat-transport', name: 'Transport', emoji: '🚗' },
			{ id: 'cat-lodging', name: 'Lodging', emoji: '🛏️' },
			{ id: 'cat-activities', name: 'Activities', emoji: '🎉' },
			{ id: 'cat-other', name: 'Other', emoji: '📝' }
		],
		paymentMethods: [
			{ id: 'pm-cash', name: 'Cash', emoji: '💵' },
			{ id: 'pm-card', name: 'Card', emoji: '💳' },
			{ id: 'pm-bank', name: 'Bank transfer', emoji: '🏦' }
		],
		trips: [
			{ id: 'trip-lisbon', name: 'Lisbon weekend', emoji: '🏖', startDate: day(-5), endDate: day(-2), createdAt: day(-20) },
			{ id: 'trip-flat', name: 'Flat costs', emoji: '🏠', startDate: day(-180), createdAt: day(-180) },
			{ id: 'trip-ski', name: 'Ski trip', emoji: '⛷️', startDate: day(-90), endDate: day(-86), createdAt: day(-100) }
		]
	},
	members: [
		{ id: 'm-anna', name: 'Anna', emoji: '🦊', color: 'violet', createdAt: day(-180) },
		{ id: 'm-marco', name: 'Marco', emoji: '🐼', color: 'cyan', createdAt: day(-180) },
		{ id: 'm-sofia', name: 'Sofia', emoji: '🐧', color: 'coral', createdAt: day(-180) }
	],
	expenses: [
		{
			id: 'e1',
			payments: [{ memberId: 'm-anna', amount: 12000 }],
			amount: 12000,
			currency: 'EUR',
			description: 'Hotel (Lisbon)',
			categoryId: 'cat-lodging',
			paymentMethodId: 'pm-card',
			tripId: 'trip-lisbon',
			date: day(-5),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-5),
			createdBy: 'm-anna'
		},
		{
			id: 'e2',
			payments: [{ memberId: 'm-marco', amount: 8400 }],
			amount: 8400,
			currency: 'EUR',
			description: 'Seafood dinner',
			categoryId: 'cat-restaurants',
			paymentMethodId: 'pm-card',
			tripId: 'trip-lisbon',
			date: day(-4),
			splitMode: 'shares',
			splits: [
				{ memberId: 'm-anna', shares: 2 },
				{ memberId: 'm-marco', shares: 2 },
				{ memberId: 'm-sofia', shares: 1 }
			],
			notes: 'Sofia not very hungry',
			createdAt: day(-4),
			createdBy: 'm-marco'
		},
		{
			id: 'e3',
			payments: [{ memberId: 'm-sofia', amount: 3200 }],
			amount: 3200,
			currency: 'EUR',
			description: 'Tram tickets',
			categoryId: 'cat-transport',
			paymentMethodId: 'pm-cash',
			tripId: 'trip-lisbon',
			date: day(-3),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-3),
			createdBy: 'm-sofia'
		},
		{
			id: 'e4',
			payments: [{ memberId: 'm-marco', amount: 3000 }],
			amount: 3000,
			currency: 'USD',
			exchangeRate: 0.92,
			rateFetchedAt: day(-3),
			description: 'Souvenirs (USD)',
			categoryId: 'cat-other',
			paymentMethodId: 'pm-card',
			tripId: 'trip-lisbon',
			date: day(-3),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-3),
			createdBy: 'm-marco'
		},
		{
			id: 'e5',
			payments: [{ memberId: 'm-anna', amount: 9800 }],
			amount: 9800,
			currency: 'EUR',
			description: 'Groceries this week',
			categoryId: 'cat-groceries',
			paymentMethodId: 'pm-card',
			tripId: 'trip-flat',
			date: day(-1),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-1),
			createdBy: 'm-anna'
		},
		{
			id: 'e6',
			payments: [{ memberId: 'm-sofia', amount: 6500 }],
			amount: 6500,
			currency: 'EUR',
			description: 'Internet bill',
			categoryId: 'cat-other',
			paymentMethodId: 'pm-bank',
			tripId: 'trip-flat',
			date: day(-2),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-2),
			createdBy: 'm-sofia'
		},
		{
			id: 'e7',
			payments: [{ memberId: 'm-marco', amount: 18000 }],
			amount: 18000,
			currency: 'EUR',
			description: 'Lift passes',
			categoryId: 'cat-activities',
			paymentMethodId: 'pm-card',
			tripId: 'trip-ski',
			date: day(-90),
			splitMode: 'even',
			splits: [{ memberId: 'm-anna' }, { memberId: 'm-marco' }, { memberId: 'm-sofia' }],
			createdAt: day(-90),
			createdBy: 'm-marco'
		}
	]
};

async function main() {
	await mkdir(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 420, height: 900 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
		colorScheme: 'dark',
		reducedMotion: 'reduce'
	});

	await context.addInitScript(() => {
		try {
			localStorage.setItem('kostos:theme', 'dark');
		} catch {
			// private mode: ignore
		}
	});

	const page = await context.newPage();
	page.on('pageerror', (e) => console.error('[pageerror]', e.message));

	async function shot(name) {
		await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
		console.log(`  ✓ ${name}.png`);
	}

	console.log('Capturing screenshots…');

	// 1. Landing
	await page.goto(`${BASE_URL}/`);
	await page.waitForSelector('text=Create a group');
	await shot('01-landing');

	// 2. Restore the seed archive
	await page.goto(`${BASE_URL}/restore`);
	await page.waitForSelector('input[type=file]');
	await page.setInputFiles('input[type=file]', {
		name: 'kostos-lisbon-crew.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(archive))
	});
	await page.waitForSelector('text=Restore on this device');
	await page.click('text=Restore on this device');
	await page.waitForURL(/\/p\/[0-9a-f]{32}/);

	// 3. Project home: balances hub (graph, owed/owe, tip, settle lines)
	await page.waitForSelector('[data-page="dashboard"]');
	await page.waitForSelector('.balance-amount');
	await page.waitForSelector('.line');
	await page.waitForTimeout(400);
	await shot('02-home');

	// 4. Settle confirm sheet (tap a transfer)
	await page.click('.line');
	await page.waitForSelector('text=Record settlement');
	await page.waitForTimeout(300);
	await shot('03-settle');
	await page.click('.sheet-cancel');
	await page.waitForTimeout(250);

	// 5. Add-expense form: math toolbar
	await page.click('a[aria-label="Add expense"]');
	await page.waitForSelector('text=New expense');
	await page.fill('.amount-input', '50/3');
	await page.focus('.amount-input');
	await page.waitForTimeout(400);
	await shot('05-math-toolbar');

	// 6. Multi-currency: pick a foreign currency and type what was charged
	await page.fill('.amount-input', '45');
	await page.fill('.title-input', 'Souvenirs');
	await page.click('.currency-chip');
	await page.waitForSelector('text=US Dollar');
	await page.click('text=US Dollar');
	await page.waitForSelector('.fx-card');
	await page.fill('.fx-input', '41.40');
	await page.click('.title-input'); // blur the amount so the math toolbar hides
	await page.waitForTimeout(300);
	await shot('04-currency');

	// The static build uses relative asset paths, so navigate client-side (clicks) rather
	// than full-reload page.goto, which would break asset resolution on deep routes.
	await page.click('[aria-label="Cancel"]'); // back to home from the form
	await page.waitForSelector('[data-page="dashboard"]');

	// 7. Stats
	await page.click('a[href$="/stats"]');
	await page.waitForSelector('.tabs-pill');
	await page.waitForTimeout(400);
	await shot('06-stats');

	// 8. Settings: data section
	await page.click('a[aria-label="Group settings"]');
	await page.waitForSelector('text=Export backup (JSON)');
	await page.evaluate(() => {
		document.querySelector('.data-card')?.scrollIntoView({ block: 'center' });
	});
	await page.waitForTimeout(300);
	await shot('08-data');

	// 9. Manage trips
	await page.click('a[href$="/settings/trips"]');
	await page.waitForSelector('.intro');
	await page.waitForTimeout(300);
	await shot('07-trips');

	await browser.close();
	console.log(`Done. ${OUT_DIR}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
