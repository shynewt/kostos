/* Takes the landing page's app screenshots from the live demo group and saves them as WebP in
 * static/landing/. Run `npm run build` first, then `npm run landing-screenshots`. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}static/landing`;
const PORT = 18_805;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTH = 390;
const HEADER = 64;

async function startServer(dataDir) {
	const server = spawn(process.execPath, ['scripts/serve.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', KOSTOS_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'inherit'] });
	await new Promise((resolve, reject) => {
		server.stdout.on('data', (chunk) => { if (/listening/i.test(chunk)) resolve(); });
		server.once('exit', (code) => reject(new Error(`serve.js exited with ${code}`)));
	});
	return server;
}

/** Playwright only writes PNG or JPEG, so the browser's own encoder makes the WebP. */
async function saveWebp(page, png, name) {
	const dataUrl = await page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
		canvas.getContext('2d').drawImage(image, 0, 0);
		return canvas.toDataURL('image/webp', 0.82);
	}, png.toString('base64'));
	await writeFile(`${OUT}/${name}.webp`, Buffer.from(dataUrl.split(',')[1], 'base64'));
	console.log(`wrote static/landing/${name}.webp`);
}

async function capture(page, name, clip) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(400);
	await saveWebp(page, await page.screenshot({ clip }), name);
}

/** Scrolls the app's inner scroller so the label sits just under the header, and returns its new top. */
async function scrollTo(page, label) {
	const labelLocator = page.getByText(label).first();
	await labelLocator.evaluate((element, header) => {
		element.closest('.scroll').scrollTop += element.getBoundingClientRect().top - header - 8;
	}, HEADER);
	await page.waitForTimeout(300);
	return (await labelLocator.boundingBox()).y;
}

await mkdir(OUT, { recursive: true });
const dataDir = `${ROOT}.kostos-data/landing-screenshots`;
const server = await startServer(dataDir);
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
try {
	const context = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
	await context.addInitScript(() => localStorage.setItem('kostos:theme', 'dark'));
	const page = await context.newPage();
	await page.goto(BASE);
	await page.getByRole('button', { name: /live demo/ }).click();
	await page.waitForURL(/\/p\/DEMO$/);
	await page.waitForTimeout(800);

	// the demo's header says "Only on this phone", which would contradict the page around it
	await capture(page, 'home', { x: 0, y: HEADER, width: WIDTH, height: 844 - HEADER });

	await page.goto(`${BASE}/p/DEMO/stats`);
	await capture(page, 'stats', { x: 0, y: HEADER, width: WIDTH, height: 700 });

	await page.goto(`${BASE}/p/DEMO/expenses/e-today-lunch`);
	await capture(page, 'expense', { x: 0, y: HEADER, width: WIDTH, height: 470 });

	await page.goto(`${BASE}/p/DEMO/add`);
	// a sum, not a plain number, so the screenshot shows the field doing the maths
	await page.fill('[aria-label="Amount, accepts math expressions"]', '(120+48)/2');
	await page.fill('input[placeholder="What was it for?"]', 'Seafood dinner');
	await page.locator('body').click({ position: { x: 5, y: 600 } });
	await capture(page, 'category', { x: 0, y: 60, width: WIDTH, height: 430 });

	await page.getByRole('button', { name: /Shares/ }).click();
	// uneven weights, or the shares split would look exactly like an even one: 2, 1, 3, 1 of €84 is €24, €12, €36, €12
	const increase = page.getByRole('button', { name: 'Increase shares' });
	await increase.nth(0).click();
	await increase.nth(2).click();
	await increase.nth(2).click();
	const splitTop = await scrollTo(page, /^split$/i);
	await capture(page, 'split', { x: 0, y: splitTop - 28, width: WIDTH, height: 330 });
} finally {
	await browser.close();
	server.kill();
}
