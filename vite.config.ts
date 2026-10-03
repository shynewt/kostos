import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		proxy: {
			'/sync': {
				target: 'ws://localhost:1234',
				ws: true,
				rewriteWsOrigin: true
			}
		}
	},
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'prompt',
			injectRegister: false,
			// offline navigations must get the static shell (200.html), not the prerendered
			// landing page, or a reload on /p/<room> renders the landing page
			kit: { adapterFallback: '200.html', spa: true },
			manifest: {
				name: 'Kostos',
				short_name: 'Kostos',
				description: 'Privacy-first group expense splitter. No accounts, encrypted, offline-ready.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				background_color: '#0a0c0a',
				theme_color: '#0a0c0a',
				icons: [
					{ src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{
						src: '/maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					},
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				// drop precaches from older builds so a stale SW can't keep serving dead
				// CSS/JS chunk names (the pre-refactor "unstyled on mobile" bug). No
				// clientsClaim: with precaching it would hand the live old page to the new
				// SW and then purge the CSS it still references. The prompt -> updateSW(true)
				// flow skips waiting and reloads together instead.
				cleanupOutdatedCaches: true
			}
		})
	]
});
