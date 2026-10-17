# Moving the hosted groups to APP_DOMAIN

## Message to each group owner (4 groups)

> Kostos is moving from kostos.shynewt.com to APP_DOMAIN, and groups get new keys on the way. Yours needs moving once.
>
> 1. Agree with your group who moves it. Only that person does steps 2 and 3; everyone else waits for the new link and should not export.
> 2. On the old site, open the group while online and wait for "Up to date". Then choose Export backup in the "Moving this group?" box at the top of the group.
> 3. On APP_DOMAIN choose "Restore from backup", pick which member you are, and share the new invite link.
> 4. Everyone else opens the new link and picks their name. If you installed the app, reinstall it from APP_DOMAIN. On iPhone: remove the old icon, open APP_DOMAIN in Safari, tap Share, then Add to Home Screen.
>
> Please finish by FREEZE_DATE. Changes made on the old site after you export will not carry over. The old site keeps working, and keeps exporting, until RETIREMENT_DATE.
>
> What moves: members, categories, payment methods, trips and expenses. What doesn't: the activity log and conflict history. The person restoring picks "this is me" again.

## Runbook

1. Register the domain and add its zone to the Cloudflare account. Fill in `docs/migration/rollout-checklist.md`.
2. Replace `APP_DOMAIN` (see the checklist) and deploy this branch as the `kostos-app` Worker. Smoke test it: create a group, join it from a second browser.
3. Cut `legacy` from the last v2 tag (`git switch -c legacy v2.10.1`) and add the migration banner (see the commits on the `legacy` branch). Set `APP_HOST` and `RETIREMENT_DATE` in `src/lib/migration.ts`, push the branch, then run the "Release legacy" workflow. It refuses to deploy while either is still a placeholder.
4. Send the owner message. The retired site's banner links to the new site ("Open the new site").
5. The mover may paste the new invite link into the old group's description; it reaches every member through normal sync.
6. After FREEZE_DATE, send a reminder as a second legacy release (the non-dismissible update prompt now reaches phones that took release one).
7. On RETIREMENT_DATE (at least three months after step 4) take the old Worker down. Only the landing page and `/join` may redirect after that date; never redirect the app.

Rollback: `wrangler rollback` for either Worker. Old rooms are untouched until the old Worker is deleted.
