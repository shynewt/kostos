/// <reference types="@cloudflare/workers-types" />
/* Cloudflare Worker entry.
 *
 * Static assets (the SvelteKit static build) come out of env.ASSETS.
 * WebSocket sync hits /sync/<relay room ID> and gets routed to a SyncRoom DO instance.
 */

import { parseProofProtocol, relayRoomIdFromPath, SYNC_PATH_PREFIX } from '../src/lib/sync/room-access.js';

export { SyncRoom } from '../src/lib/server/sync-do';

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	SYNC_ROOM: DurableObjectNamespace;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.startsWith(SYNC_PATH_PREFIX)) {
			if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
				return new Response('Expected WebSocket', { status: 426 });
			}
			const relayRoomId = relayRoomIdFromPath(url.pathname);
			if (!relayRoomId) return new Response('Bad room', { status: 400 });
			if (!parseProofProtocol(request.headers.get('Sec-WebSocket-Protocol'))) return new Response('Unauthorized', { status: 401 });
			return env.SYNC_ROOM.get(env.SYNC_ROOM.idFromName(relayRoomId)).fetch(request);
		}

		// the fallback below reuses the request, and a body (a bot's POST) can only be read once
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
		}

		const assetResponse = await env.ASSETS.fetch(request);
		if (assetResponse.status !== 404) return assetResponse;

		// SPA fallback: serve `200.html` (SvelteKit's static shell) for any
		// unknown route so the client router can resolve it. The bare `index.html`
		// is the prerendered landing page; using it as a fallback pins every
		// route to `/` after hydration.
		const fallbackUrl = new URL('/200', url);
		const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
		const headers = new Headers(fallback.headers);
		// app screens and unknown paths share one shell; search engines should index neither
		headers.set('X-Robots-Tag', 'noindex');
		return new Response(fallback.body, { status: 200, headers });
	}
} satisfies ExportedHandler<Env>;
