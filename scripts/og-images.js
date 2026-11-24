/* Draws the 1200 by 630 link preview cards into static/ with the app's own fonts and colours.
 * Run after changing the copy or the brand: `npm run og-images`. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

async function fontFace(family, weight, file) {
	const data = (await readFile(root(`node_modules/@fontsource/${file}`))).toString('base64');
	return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`;
}

const icon = await readFile(root('static/icon.svg'), 'utf8');

const cards = [
	{
		file: 'static/og-image.png',
		eyebrow: 'Group expense splitter',
		headline: 'kostos',
		headlineSize: 150,
		headlineClass: 'wordmark',
		body: 'Split bills with friends. No accounts, end-to-end encrypted, works offline.'
	},
	{
		file: 'static/og-invite.png',
		eyebrow: 'Invitation',
		headline: 'You’re invited to a group',
		headlineSize: 92,
		body: 'Join on Kostos to split expenses together. No account needed.'
	}
];

function page(card, fonts) {
	return `<!doctype html><html><head><style>
		${fonts}
		* { margin: 0; box-sizing: border-box; }
		body {
			width: 1200px; height: 630px; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between;
			background: radial-gradient(900px 520px at 88% 0%, #c4ff4f2e, transparent 70%), #0a0c0a; color: #ededed;
			font-family: 'Inter'; overflow: hidden;
		}
		.top { display: flex; align-items: center; gap: 22px; }
		.top svg { width: 84px; height: 84px; }
		.eyebrow { font-family: 'JetBrains Mono'; font-weight: 500; font-size: 26px; letter-spacing: 0.14em; text-transform: uppercase; color: #c4ff4f; }
		h1 { font-family: 'Instrument Serif'; font-weight: 400; font-size: ${card.headlineSize}px; line-height: 0.95; letter-spacing: -0.02em; }
		h1.wordmark { font-family: 'Inter'; font-weight: 700; letter-spacing: -0.045em; }
		p { margin-top: 26px; max-width: 900px; font-size: 38px; line-height: 1.3; color: #a0a59c; }
		.site { font-family: 'JetBrains Mono'; font-weight: 500; font-size: 26px; color: #a0a59c; letter-spacing: 0.06em; }
	</style></head><body>
		<div class="top">${icon}<span class="eyebrow">${card.eyebrow}</span></div>
		<div><h1 class="${card.headlineClass ?? ''}">${card.headline}</h1><p>${card.body}</p></div>
		<div class="site">kostos.app</div>
	</body></html>`;
}

const fonts = (await Promise.all([
	fontFace('Instrument Serif', 400, 'instrument-serif/files/instrument-serif-latin-400-normal.woff2'),
	fontFace('Inter', 400, 'inter/files/inter-latin-400-normal.woff2'),
	fontFace('Inter', 700, 'inter/files/inter-latin-700-normal.woff2'),
	fontFace('JetBrains Mono', 500, 'jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')
])).join('\n');

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
try {
	const browserPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
	for (const card of cards) {
		await browserPage.setContent(page(card, fonts));
		await browserPage.evaluate(() => document.fonts.ready);
		await browserPage.screenshot({ path: root(card.file) });
		console.log(`wrote ${card.file}`);
	}
} finally {
	await browser.close();
}
