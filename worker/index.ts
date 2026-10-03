/// <reference types="@cloudflare/workers-types" />
/* Cloudflare Worker entry.
 *
 * Static assets (the SvelteKit static build) come out of env.ASSETS.
 * WebSocket sync hits /sync/<roomId> and gets routed to a SyncRoom DO instance.
 */

export { SyncRoom } from '../src/lib/server/sync-do';

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	SYNC_ROOM: DurableObjectNamespace;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith('/sync/')) {
			if (request.headers.get('Upgrade') !== 'websocket') {
				return new Response('Expected WebSocket', { status: 426 });
			}
			let roomId = '';
			try {
				roomId = decodeURIComponent(url.pathname.slice('/sync/'.length)).toUpperCase();
			} catch {
				return new Response('Bad roomId', { status: 400 });
			}
			if (!roomId) return new Response('Missing roomId', { status: 400 });
			const id = env.SYNC_ROOM.idFromName(roomId);
			return env.SYNC_ROOM.get(id).fetch(request);
		}

		const assetResponse = await env.ASSETS.fetch(request);
		if (assetResponse.status !== 404) return assetResponse;

		// SPA fallback: serve `200.html` (SvelteKit's static shell) for any
		// unknown route so the client router can resolve it. The bare `index.html`
		// is the prerendered landing page; using it as a fallback pins every
		// route to `/` after hydration.
		const fallbackUrl = new URL('/200', url);
		const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
		return new Response(fallback.body, {
			status: 200,
			headers: fallback.headers
		});
	}
} satisfies ExportedHandler<Env>;
