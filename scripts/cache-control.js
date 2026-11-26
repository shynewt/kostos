// Only content-hashed build output may be cached for good. Everything else (sw.js, the
// web manifest, icons, pages) keeps its name across releases, so caching it would let a
// browser or a proxy in front of the server hold on to an old release.
const HASHED_DIR = /(^|\/)_app\/immutable\//;

export function cacheControlFor(urlPath) {
	return HASHED_DIR.test(urlPath) ? 'public, max-age=31536000, immutable' : 'no-cache';
}
