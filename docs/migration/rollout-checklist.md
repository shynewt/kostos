# v3 rollout checklist

Nothing deploys until the domain is final. Fill in the fields first, then replace the placeholders.

Fields:

- Domain (`APP_DOMAIN`): ____
- Freeze date (`FREEZE_DATE`, owners finish moving by then): ____
- Retirement date (`RETIREMENT_DATE`, at least three months after the owner message): ____
- Owners of the 4 hosted groups: ____

Checklist:

- [ ] Domain registered, zone in the same Cloudflare account, `CLOUDFLARE_API_TOKEN` scope includes it.
- [ ] `APP_DOMAIN` replaced in the route pattern of `wrangler.toml` and the `production` environment `url:` of `.github/workflows/release.yml`. `rg -n APP_DOMAIN wrangler.toml` finds nothing, and `rg -n "url: https://APP_DOMAIN" .github/workflows/release.yml` finds nothing (those are the two things the Release workflow's guard checks).
- [ ] The README live demo link points at the real domain: `rg -n "https://APP_DOMAIN" README.md` finds nothing.
- [ ] On the `legacy` branch, `src/lib/migration.ts` sets real values for `APP_HOST` and `RETIREMENT_DATE`: `rg -n "= '(APP_DOMAIN|RETIREMENT_DATE)'" src/lib/migration.ts` finds nothing.
- [ ] `workers_dev = false` and `preview_urls = false` on the new Worker, so there is no second public origin.
- [ ] Cloudflare WAF rate-limit rule on `/sync/*`.
- [ ] Workers Logs checked: invocation logs are off, and a test connection leaves no `kostos1.` value in the dashboard. If that cannot be shown, the README says so.
- [ ] `wrangler deploy --dry-run` passes for the new Worker (this branch) and for the old one (the `legacy` branch).
- [ ] This branch is on `main`, `legacy` is pushed, `release-legacy.yml` shows up in Actions, and the `production-legacy` environment exists with its own Cloudflare secrets.
- [ ] The owner message (`docs/migration/owner-message-and-runbook.md`) is filled in and sent to each of the 4 owners.
- [ ] Rollback understood: `wrangler rollback` for code problems on a Worker that has an earlier version (not the first `kostos-app` deploy, which means redeploy or delete); old rooms stay until the retirement date.
- [ ] Final `rg "PRT-"`, `rg "kostos\.(app|fi)"` and `rg "kostos\.shynewt\.com"` outside `docs/`: only the chosen domain, the old domain in the legacy banner, and the old-format fixtures in tests and `sync.e2e.ts` remain.
