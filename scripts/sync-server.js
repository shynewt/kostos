/* Kostos sync relay.
 *
 * Plain WebSocket broadcaster that knows nothing about the payloads it relays.
 * Clients connect to ws://host:port/<roomId>; every message they send is appended
 * to the room's history and forwarded to all other connected peers. New joiners
 * receive the cached history so they can rebuild state without needing a peer
 * online.
 *
 * Privacy: payloads are AES-GCM ciphertexts. The server never holds the secret
 * key, so the history it keeps is opaque. Rotate the project token to invalidate
 * everything an attacker who compromised the server could replay.
 *
 * Persistence: history lives in memory. For production, swap the history Map for
 * a LevelDB/SQLite store. The relay protocol is unchanged.
 */

import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 1234);
const HOST = process.env.HOST ?? '0.0.0.0';
const HISTORY_CAP = Number(process.env.HISTORY_CAP ?? 1000);

const rooms = new Map(); // roomId -> { sockets: Set<WebSocket>, history: Buffer[] }

function getRoom(id) {
	let room = rooms.get(id);
	if (!room) {
		room = { sockets: new Set(), history: [] };
		rooms.set(id, room);
	}
	return room;
}

const wss = new WebSocketServer({ port: PORT, host: HOST });

wss.on('connection', (ws, req) => {
	// first thing: an unhandled 'error' (bad frame, oversized payload) kills the process,
	// including on sockets we're about to reject
	let room = null;
	ws.on('error', () => {
		room?.sockets.delete(ws);
		ws.terminate();
	});

	let roomId = '';
	try {
		const url = new URL(req.url ?? '/', 'http://localhost');
		const match = url.pathname.match(/^\/sync\/(.+)$/);
		roomId = match ? decodeURIComponent(match[1]).toUpperCase() : '';
	} catch {
		// malformed target or escape; treated as a missing room below
	}
	if (!roomId) {
		ws.close(1008, 'missing room');
		return;
	}

	room = getRoom(roomId);
	room.sockets.add(ws);

	for (const blob of room.history) {
		if (ws.readyState === ws.OPEN) ws.send(blob);
	}

	ws.on('message', (data, isBinary) => {
		if (!isBinary) {
			// heartbeat: mirror the Cloudflare relay's auto ping/pong so the client's
			// zombie-socket detection behaves the same in local dev
			if (data.toString() === 'ping' && ws.readyState === ws.OPEN) ws.send('pong');
			return;
		}
		const buf = data instanceof Buffer ? data : Buffer.from(data);
		room.history.push(buf);
		while (room.history.length > HISTORY_CAP) room.history.shift();
		for (const peer of room.sockets) {
			if (peer === ws) continue;
			if (peer.readyState === peer.OPEN) peer.send(buf);
		}
	});

	ws.on('close', () => {
		room.sockets.delete(ws);
		// Keep history in memory even when empty so reconnects rebuild state.
	});
});

// log once the port is bound, not when the server object is created
wss.on('listening', () => console.log(`Kostos sync relay listening on ws://${HOST}:${PORT}`));
