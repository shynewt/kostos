# Moving the hosted groups to APP_DOMAIN

## Message to each group owner (4 groups)

Fill in APP_DOMAIN, FREEZE_DATE and RETIREMENT_DATE (see the fields in `rollout-checklist.md`) before sending.

> Kostos is moving from kostos.shynewt.com to APP_DOMAIN, and every group gets a new invite link on the way. Yours needs moving once.
>
> 1. Agree with your group who moves it. Only that person does steps 2 and 3; everyone else waits for the new link and should not export.
> 2. On the old site, open the group while online and wait until the line under the group name shows the group code (like PRT-AB12-CD34) with a solid dot, not "Checking…" or "Syncing". Tap it; it should say "Up to date". Then tap Export backup in the "Moving this group?" box at the top of the group. If the button says "Export anyway", the phone is not ready yet. A file named kostos-<group>-<date>.json lands in your Downloads.
> 3. In the same box tap "Restore on the new site". (Or open APP_DOMAIN, tap Create a group, then "Got a backup file? Restore instead" on the New group screen.) Tap Choose file and pick the exported file, choose which member you are under "Which member are you?", and tap Restore on this device. Then tap the Share icon at the top of the new group to get its invite link, and send that link to your group.
> 4. Everyone else opens the new link and picks their name. If you installed the app, reinstall it from APP_DOMAIN. On iPhone the installed app has its own storage: remove the old icon, open APP_DOMAIN in Safari, tap Share, then Add to Home Screen, and paste the new invite link under "Join a group" inside the app.
>
> Please finish by FREEZE_DATE. Changes made on the old site after you export will not carry over. The old site keeps working, and keeps exporting, until RETIREMENT_DATE, and then it is switched off.
>
> What moves: members, categories, payment methods, trips and expenses. What doesn't: the activity log and conflict history. The person restoring picks which member they are again.

## Runbook

1. Register the domain and add its zone to the Cloudflare account. Fill in the fields at the top of `rollout-checklist.md`.
2. Replace `APP_DOMAIN` in the route pattern of `wrangler.toml` and in the `production` environment `url:` of `.github/workflows/release.yml`; the Release workflow refuses to run otherwise. Also replace the live-demo link at the top of `README.md` (`https://APP_DOMAIN`). Those are the only three spots; never run a global search-and-replace, because the release guard builds its search word from two pieces on purpose. Deploy with `npm run cf:deploy` from this branch, or run the Release workflow once the branch is on `main`. Smoke test it: create a group, join it from a second browser. This is the first deploy of the `kostos-app` Worker, so it has no earlier version. Publish 3.0.0 as a stable release; `docker.yml` then tags the image `latest`, `3`, `3.0` and `3.0.0`. A later stable release of an older line (a 2.x hotfix) would take `:latest` from v3, so cut hotfixes for older lines as pre-releases.
3. The `legacy` branch already exists locally, cut from `v2.10.1`, and is not pushed. If it is checked out in a worktree, work there; otherwise `git worktree add ../kostos-legacy legacy`. It carries the old site plus the move banner (`MigrationBanner`, the "Moving this group?" box in `MoveGroupCard`, the export warning in `src/lib/migration.ts`) and a non-dismissible update prompt. Set `APP_HOST` and `RETIREMENT_DATE` in `src/lib/migration.ts`, commit, and publish with `git push -u origin legacy`.
4. Deploy the legacy build with the "Release legacy" workflow. It is a manual `workflow_dispatch` that checks out the `legacy` branch and shows up in Actions only once `release-legacy.yml` is on the default branch, so merge this branch first. It needs the `production-legacy` environment with its own `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Run it from the Actions tab or with `gh workflow run release-legacy.yml`. It refuses to deploy while `APP_HOST` or `RETIREMENT_DATE` is still a placeholder. Never create a GitHub release for `legacy`: `docker.yml` would publish that build as `latest`.
5. Send the owner message. The retired site's banner links to the new site ("Open the new site").
6. Optionally, after restoring, the mover can paste the new invite link into the old group's description. It syncs to every member, but it only shows in the group's Settings, so it backs up the message and does not replace it.
7. To remind people after FREEZE_DATE, change the banner wording on `legacy` and run "Release legacy" again. Installed apps only show their update prompt when the deployed assets change, so a redeploy with identical files reaches nobody. Phones that took the first release get the prompt again; the prompt can't be dismissed.
8. On RETIREMENT_DATE (at least three months after step 5) delete the old `kostos` Worker, which also deletes its rooms, and remove its custom domain. After that nothing answers on the old domain and nothing redirects. The app is never redirected: installed apps and WebSocket upgrades don't follow redirects, and an unexported group would become unreachable. A redirect for only the landing page and `/join` would need a separate small Worker, which this change doesn't build.

Rollback: `npx wrangler rollback` returns either Worker to its previous version, except the first deploy of `kostos-app`, which has none: redeploy a fixed build or delete the Worker. Old rooms are untouched until the old Worker is deleted.
