# Deploying Kostos to Cloudflare Workers

This is how kostos.app runs: the static bundle is served as Workers static assets, and sync goes through a Durable Object.

```sh
npm install
npx wrangler login
npm run cf:deploy
```

The entry point is `worker/index.ts`. It routes `/sync/*` to a `SyncRoom` Durable Object (in `src/lib/server/sync-do.ts`) and sends everything else to the static assets binding. The Durable Object uses hibernating WebSockets, so idle rooms use no CPU, and its SQLite storage works on the Workers Free plan.

## Configuration

Configuration lives in `wrangler.toml`. The Worker is named `kostos-app` and has its own Durable Object namespace, so rooms on an older Worker are left alone. `workers_dev` and `preview_urls` are off, which leaves your custom domain as the only public address, and that domain's zone has to be on your Cloudflare account.

Before deploying, replace `APP_DOMAIN` in the route pattern in `wrangler.toml`. If you deploy with `.github/workflows/release.yml`, also replace it in the `url:` of the `production` environment; the workflow refuses to run while either one is still a placeholder. Edit only those two places rather than searching and replacing across the repo. The workflow's check would survive that (it builds its search word from two pieces), but it would also rewrite the placeholders in `docs/migration`.

If the older `kostos` Worker still serves your custom domain, remove the domain from it in the Cloudflare dashboard first. A custom domain can point at only one Worker, so the `kostos-app` deploy fails while the old one holds it.

## Logs

`wrangler.toml` turns off Workers invocation logs, so the access proof in the `Sec-WebSocket-Protocol` header isn't retained. Cloudflare's edge and any Logpush job you add yourself are outside that setting, and the server sees the relay room ID and the proof by design.

## Local testing

To run the mobile sync scenarios against local Cloudflare instead of Node, build the app, run `npm run cf:dev`, and set `KOSTOS_E2E_BASE_URL` to its URL when running `npm run test:e2e -- e2e/sync.e2e.ts`. Playwright needs Chromium installed; `PLAYWRIGHT_CHROMIUM_PATH` can point at one you already have.

For storage limits and other operating notes, see [Running a Kostos server](self-hosting.md).
