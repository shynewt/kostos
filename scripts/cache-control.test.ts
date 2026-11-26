import { describe, expect, it } from 'vitest';
import { cacheControlFor } from './cache-control.js';

describe('cacheControlFor', () => {
	it('caches content-hashed build files for good', () => {
		expect(cacheControlFor('_app/immutable/chunks/index.BdT3x9.js')).toBe('public, max-age=31536000, immutable');
	});

	it('revalidates files that keep their name across releases', () => {
		for (const path of ['sw.js', 'manifest.webmanifest', 'pwa-192x192.png', '200.html', 'landing/split.webp', '_app/version.json']) {
			expect(cacheControlFor(path)).toBe('no-cache');
		}
	});
});
