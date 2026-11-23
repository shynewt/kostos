# Moving the hosted groups to kostos.app

## Message to each group owner

Send this to the owners you know (see `rollout-checklist.md`) and ask them to pass it on. Groups whose owners you can't reach see the same steps in the banner on the old site.

> Kostos is moving from kostos.shynewt.com to kostos.app. Your groups move by themselves; each person does this once:
>
> 1. Open kostos.shynewt.com while online. If it asks to update, tap Update.
> 2. Open each of your groups. A box at the top says "Moving this group to kostos.app…" and, after a moment, "This group is ready on kostos.app".
> 3. Tap Open on kostos.app. You land in the same group as the same person, with everything in it, history included.
>
> If you installed the app, install it again from kostos.app afterwards. On iPhone the installed app has its own storage: remove the old icon, open kostos.app in Safari, tap Share, then Add to Home Screen. Then, on the old site, tap Copy invite link in each group and paste it under "Join a group" inside the new app.
>
> Please do it by 31 January 2027. Until 1 March 2027 the old site keeps working, and anything changed there still reaches kostos.app; after that it is switched off.

## Runbook

1. Register the domain and add its zone to the Cloudflare account. Fill in the fields at the top of `rollout-checklist.md`.
2. Deploy `kostos-app`.
   - Replace `APP_DOMAIN` in the route pattern of `wrangler.toml`, in the `production` environment `url:` of `.github/workflows/release.yml` (the Release workflow refuses to run otherwise), and in the live-demo link at the top of `README.md` (`https://APP_DOMAIN`).
   - Deploy with `npm run cf:deploy` from this branch, or run the Release workflow once the branch is on `main`. This is the first deploy of the `kostos-app` Worker, so it has no earlier version to roll back to.
   - Smoke test: create a group, then join it from a second browser.
   - Publish 3.0.0 as a stable release; `docker.yml` then tags the image `latest`, `3`, `3.0` and `3.0.0`. A later stable release of an older line (a 2.x hotfix) would take `:latest` from v3, so cut hotfixes for older lines as pre-releases.
3. The `legacy` branch already exists locally, cut from `v2.10.1`, and is not pushed. If it is checked out in a worktree, work there; otherwise `git worktree add ../kostos-legacy legacy`. It carries the old site plus the move: the banner (`MigrationBanner`), the per-group box (`MoveGroupCard`), the copy to kostos.app (`src/lib/move/`, see the design doc's "Hosted migration") and a non-dismissible update prompt. Set `APP_HOST` and `RETIREMENT_DATE` in `src/lib/migration.ts`, commit, and publish with `git push -u origin legacy`.
4. Deploy the legacy build with the "Release legacy" workflow. It is a manual `workflow_dispatch` that checks out the `legacy` branch and shows up in Actions only once `release-legacy.yml` is on the default branch, so merge this branch first. It runs in the `production-legacy` environment, which GitHub creates on the first run, and uses the repo-level `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets. Run it from the Actions tab or with `gh workflow run release-legacy.yml`. It refuses to deploy while `APP_HOST` or `RETIREMENT_DATE` is still a placeholder. Never create a GitHub release for `legacy`: `docker.yml` would publish that build as `latest`. Smoke test after it deploys: open one of your groups on kostos.shynewt.com, wait for "This group is ready on kostos.app", tap Open on kostos.app and check you land in the group as yourself.
5. Send the owner message. Groups whose owners you can't reach move the same way, from the banner and the box in each group.
6. To remind people after FREEZE_DATE, change the banner wording on `legacy` and run "Release legacy" again. Installed apps only show their update prompt when the deployed assets change, so a redeploy with identical files reaches nobody. Phones that took the first release get the prompt again; the prompt can't be dismissed.
7. On RETIREMENT_DATE (at least three months after step 5) delete the old `kostos` Worker, which also deletes its rooms, and remove its custom domain. After that nothing answers on the old domain and nothing redirects. The app is never redirected: installed apps and WebSocket upgrades don't follow redirects, and an unexported group would become unreachable. A redirect for only the landing page and `/join` would need a separate small Worker, which this change doesn't build.

Rollback: `npx wrangler rollback` returns either Worker to its previous version, except the first deploy of `kostos-app`, which has none: redeploy a fixed build or delete the Worker. Old rooms are untouched until the old Worker is deleted.
