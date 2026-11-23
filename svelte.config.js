import adapter from '@sveltejs/adapter-static';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

/* App version, resolved at build time so it always matches the released git tag and we
 * never hand-bump it. `git describe` gives the exact tag on a release build (e.g. 2.2.1)
 * and tag+commits on dev builds (e.g. 2.2.1-4-gabc123). Falls back to the override env var,
 * then package.json (e.g. a Docker build with no .git). execFileSync runs git directly with
 * a fixed argument list, so there is no shell and no injection surface. */
function resolveVersion() {
	// CI release events expose the tag as GITHUB_REF_NAME (e.g. "v2.2.2") with no tag fetch
	// needed; an explicit PUBLIC_APP_VERSION override wins. Only accept version-like values
	// so a branch dispatch ("main") falls through to git describe.
	const fromEnv = process.env.PUBLIC_APP_VERSION || process.env.GITHUB_REF_NAME;
	if (fromEnv && /^v?\d/.test(fromEnv)) return fromEnv.replace(/^v/, '');
	try {
		const described = execFileSync('git', ['describe', '--tags', '--always', '--dirty'], {
			stdio: ['ignore', 'pipe', 'ignore']
		})
			.toString()
			.trim();
		if (described) return described.replace(/^v/, '');
	} catch {
		// not a git checkout
	}
	return pkg.version;
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Absolute asset URLs (/_app/...), not relative. With SPA fallback the app shell is
		// served for deep routes like /p/<room>/people; relative paths would resolve against
		// that URL (/p/<room>/_app/...), miss, fall back to HTML, and break JS + CSS. We are
		// always served from the domain root, so absolute is correct.
		paths: { relative: false },
		// surfaces as `version` from $app/environment so we can show it in the UI
		version: { name: resolveVersion() },
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '200.html',
			precompress: false,
			strict: true
		}),
		prerender: {
			// nothing links to a bare /join, so it is listed for its link-preview card
			entries: ['/', '/join']
		}
	}
};

export default config;
