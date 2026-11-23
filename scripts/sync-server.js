/* Development relay. Uses the same durable protocol as the self-hosted server. */
import { WebSocketServer } from 'ws';
import { resolve } from 'node:path';
import { createRelay } from './relay.js';
import { MAX_MESSAGE_BYTES } from '../src/lib/sync/relay-protocol.js';
import { parseSyncRequest } from '../src/lib/sync/room-access.js';

const PORT = Number(process.env.PORT ?? 1234);
const HOST = process.env.HOST ?? '0.0.0.0';
const attachRelay = createRelay(resolve(process.env.KOSTOS_DATA_DIR ?? '.kostos-data/dev'));
const wss = new WebSocketServer({ port: PORT, host: HOST, maxPayload: MAX_MESSAGE_BYTES });
wss.on('connection', (ws, req) => {
	ws.on('error', () => ws.terminate());
	const sync = parseSyncRequest(req.url, req.headers['sec-websocket-protocol']);
	if (!sync) { ws.close(1008, 'Missing room or proof'); return; }
	attachRelay(ws, sync.relayRoomId, sync.proof);
});
wss.on('listening', () => console.log(`Kostos sync relay listening on ws://${HOST}:${PORT}`));
