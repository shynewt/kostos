/* Self-hosted Kostos server.
 *
 * Serves the SvelteKit static build (build/) over HTTP and relays encrypted
 * WebSocket traffic on /sync/<relay room ID>. Single process, single port. Designed
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
import { createRelay } from './relay.js';
import { MAX_MESSAGE_BYTES } from '../src/lib/sync/relay-protocol.js';
import { parseSyncRequest } from '../src/lib/sync/room-access.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const attachRelay = createRelay(resolve(process.env.KOSTOS_DATA_DIR ?? '.kostos-data/serve'));
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

function serveFile(filePath, res, extraHeaders = {}) {
	const ext = extname(filePath).toLowerCase();
	const type = MIME[ext] ?? 'application/octet-stream';
	res.writeHead(200, {
		'Content-Type': type,
		'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
		...extraHeaders
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
		// try a prerendered page next
	}

	try {
		const page = `${candidate}.html`;
		if (statSync(page).isFile()) {
			serveFile(page, res);
			return;
		}
	} catch {
		// fall through to SPA fallback
	}

	try {
		statSync(FALLBACK);
		// app screens and unknown paths share one shell; search engines should index neither
		serveFile(FALLBACK, res, { 'X-Robots-Tag': 'noindex' });
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

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

server.on('upgrade', (request, socket, head) => {
	// an unhandled 'error' (bad frame, oversized payload) would take the whole process down
	socket.on('error', () => socket.destroy());
	const sync = parseSyncRequest(request.url, request.headers['sec-websocket-protocol']);
	if (!sync) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(request, socket, head, (ws) => {
		attachRelay(ws, sync.relayRoomId, sync.proof);
	});
});

// Docker sends SIGTERM and kills after 10s; as PID 1 node ignores it without a handler.
// Close clients, let accepted writes finish their fsync, then exit.
let shuttingDown = false;
function shutdown(signal) {
	if (shuttingDown) process.exit(1);
	shuttingDown = true;
	console.log(`[kostos] ${signal} received, shutting down`);
	setTimeout(() => process.exit(1), 8000).unref();
	server.close();
	server.closeIdleConnections();
	for (const client of wss.clients) client.close(1001, 'Server restarting');
	attachRelay.drain().then(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
	console.log(`[kostos] static build: ${BUILD_DIR}`);
	console.log(`[kostos] listening on http://${HOST}:${PORT}`);
	console.log(`[kostos] sync upgrades on ws://${HOST}:${PORT}/sync/<relay room ID>`);
});
