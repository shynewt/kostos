/* Development relay. Uses the same durable protocol as the self-hosted server. */
import { WebSocketServer } from 'ws';
import { resolve } from 'node:path';
import { createRelay } from './relay.js';
import { MAX_MESSAGE_BYTES } from '../src/lib/sync/relay-protocol.js';

const PORT = Number(process.env.PORT ?? 1234);
const HOST = process.env.HOST ?? '0.0.0.0';
const attachRelay = createRelay(resolve(process.env.KOSTOS_DATA_DIR ?? '.kostos-data/dev'));
const wss = new WebSocketServer({ port: PORT, host: HOST, maxPayload: MAX_MESSAGE_BYTES });
wss.on('connection', (ws, req) => {
	ws.on('error', () => ws.terminate());
	let roomId = '';
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const match = url.pathname.match(/^\/sync\/(.+)$/);
		roomId = match ? decodeURIComponent(match[1]).toUpperCase() : '';
	} catch { /* Invalid room. */ }
	if (!roomId) { ws.close(1008, 'missing room'); return; }
	attachRelay(ws, roomId);
});
wss.on('listening', () => console.log(`Kostos sync relay listening on ws://${HOST}:${PORT}`));
