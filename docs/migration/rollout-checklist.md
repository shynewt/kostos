# v3 rollout checklist

Nothing deploys until the domain is final. Replace `APP_DOMAIN` everywhere first.

- [ ] Domain registered, zone in the same Cloudflare account, `CLOUDFLARE_API_TOKEN` scope includes it.
- [ ] `APP_DOMAIN` replaced in `wrangler.toml`, `.github/workflows/release.yml`, `README.md` and, on the `legacy` branch, `src/lib/migration.ts`. `rg APP_DOMAIN --glob '!docs/**'` finds nothing afterwards.
- [ ] `workers_dev = false` and `preview_urls = false` on the new Worker, so there is no second public origin.
- [ ] Cloudflare WAF rate-limit rule on `/sync/*`.
- [ ] Workers Logs checked: invocation logs are off, and a test connection leaves no `kostos1.` value in the dashboard. If that cannot be shown, the README says so.
- [ ] `wrangler deploy --dry-run` passes for the new Worker (this branch) and for the old one (the `legacy` branch).
- [ ] `release-legacy.yml` and its `production-legacy` environment exist, with their own Cloudflare secrets, pinned to the `legacy` branch.
- [ ] A short message sent to each of the 4 owners: what to do, a freeze date, the retirement date (`docs/migration/owner-message-and-runbook.md`).
- [ ] Rollback understood: `wrangler rollback` for code problems; old rooms stay until the retirement date.
- [ ] Final `rg "PRT-"`, `rg "kostos\.(app|fi)"` and `rg "kostos\.shynewt\.com"` outside `docs/`: only the chosen domain, the old domain in the legacy banner, and the old-format fixtures in tests and `sync.e2e.ts` remain.
