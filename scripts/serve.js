/* Self-hosted Kostos server.
 *
 * Serves the SvelteKit static build (build/) over HTTP and relays encrypted
 * WebSocket traffic on /sync/<roomId>. Single process, single port. Designed
 * to run inside a Docker container or any Node-capable host.
 *
 * Payloads are AES-GCM ciphertext from the client; the relay never holds the
 * key, so the history it keeps is opaque.
 */

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const HISTORY_CAP = Number(process.env.HISTORY_CAP ?? 1000);
const BUILD_DIR = resolve(fileURLToPath(new URL('../build', import.meta.url)));
const FALLBACK = join(BUILD_DIR, '200.html');

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
	'.webmanifest': 'application/manifest+json',
	'.map': 'application/json'
};

const rooms = new Map(); // roomId -> { sockets: Set<WebSocket>, history: Buffer[] }

function getRoom(id) {
	let room = rooms.get(id);
	if (!room) {
		room = { sockets: new Set(), history: [] };
		rooms.set(id, room);
	}
	return room;
}

// malformed escapes like /%ZZ throw URIError; callers treat null as a bad request
function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function safeJoin(root, urlPath) {
	const decoded = safeDecode(urlPath.split('?')[0]);
	if (decoded === null) return null;
	const normalized = normalize(decoded).replace(/^[/\\]+/, '');
	const full = join(root, normalized);
	return full.startsWith(root) ? full : null;
}

function serveFile(filePath, res) {
	const ext = extname(filePath).toLowerCase();
	const type = MIME[ext] ?? 'application/octet-stream';
	res.writeHead(200, {
		'Content-Type': type,
		'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
	});
	createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
	const candidate = safeJoin(BUILD_DIR, req.url ?? '/');
	if (!candidate) {
		res.writeHead(400);
		res.end('bad path');
		return;
	}

	try {
		const stat = statSync(candidate);
		if (stat.isFile()) {
			serveFile(candidate, res);
			return;
		}
		if (stat.isDirectory()) {
			const indexFile = join(candidate, 'index.html');
			if (statSync(indexFile).isFile()) {
				serveFile(indexFile, res);
				return;
			}
		}
	} catch {
		// fall through to SPA fallback
	}

	try {
		statSync(FALLBACK);
		serveFile(FALLBACK, res);
	} catch {
		res.writeHead(404);
		res.end('not found');
	}
}

const server = createServer((req, res) => {
	if (req.url === '/healthz') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('ok');
		return;
	}
	serveStatic(req, res);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
	// an unhandled 'error' (bad frame, oversized payload) would take the whole process down
	socket.on('error', () => socket.destroy());
	// fixed base so the Host header can't affect parsing; a malformed target still throws
	let url;
	try {
		url = new URL(request.url ?? '/', 'http://localhost');
	} catch {
		socket.destroy();
		return;
	}
	const match = url.pathname.match(/^\/sync\/(.+)$/);
	if (!match) {
		socket.destroy();
		return;
	}
	const roomId = safeDecode(match[1])?.toUpperCase();
	if (!roomId) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(request, socket, head, (ws) => {
		const room = getRoom(roomId);
		room.sockets.add(ws);
		ws.on('error', () => {
			room.sockets.delete(ws);
			ws.terminate();
		});

		for (const blob of room.history) {
			if (ws.readyState === ws.OPEN) ws.send(blob);
		}

		ws.on('message', (data, isBinary) => {
			if (!isBinary) {
				// heartbeat, same contract as the dev relay and the Cloudflare auto-response
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

		ws.on('close', () => room.sockets.delete(ws));
	});
});

server.listen(PORT, HOST, () => {
	console.log(`[kostos] static build: ${BUILD_DIR}`);
	console.log(`[kostos] listening on http://${HOST}:${PORT}`);
	console.log(`[kostos] sync upgrades on ws://${HOST}:${PORT}/sync/<roomId>`);
});
