# Upgrading a self-hosted server to v3

v3 changed the sync protocol: the server only lets in a client that proves it holds the group key, and the 22-character group key replaced the short room label. A v2 client sends no proof, so it can't sync with a v3 server, and every group gets a new invite link. The data comes along through export and restore.

These steps are for Docker and Node self-hosters. On Cloudflare, deploy the `kostos-app` Worker as described in [Deploying to Cloudflare Workers](cloudflare.md) and move groups the same way.

## Steps

1. Ask members to open the app online once, so their devices hold the latest data. After the upgrade, an installed app keeps running v2 until the member taps Update on the "A new version of Kostos is ready." prompt. Until then it shows Offline and new edits pile up on the phone.
2. Pull the new image (change the tag from `:2` to `:3` if you pin it) and restart with the same volume, variables and port. If you run `:latest`, the pull is the upgrade, so finish step 1 first.
3. Check that the server is reached over HTTPS.
   - v2 sync needed HTTPS too, so a plain-HTTP address wasn't syncing before either. The difference is that in v3, new group, restore and join refuse to start there and show "Kostos needs HTTPS (or localhost) to encrypt your data."
   - Moving a LAN server behind HTTPS changes its web address, and the groups saved on a device stay with the old address.
   - So export each group at the old address first (v3 still opens it there and offers Export backup), then restore the file at the new HTTPS address.
4. Once a member has tapped Update, open each group on one of their devices. v3 recognises the old format, doesn't try to sync it, and shows a banner ("This group no longer syncs.") with two buttons: Export backup, and Restore as a new group.
5. Restore on that device: choose the backup file, then check "Which member are you?". It preselects the first member in the list, so pick yourself if that isn't you (after restoring, you can also tap a member in the Group tab and choose "This is me"). Tap Restore on this device, then use the Share icon at the top of the new group to send its invite link, and everyone else joins with that link. Only one person per group does steps 4 and 5.

   The old copy stays on each phone, marked "No longer syncs". Once the new group looks right, open the old one, go to the Group tab and tap "Forget this group on this device". That deletes the old data on that phone, so export first.
6. When everyone has moved, delete the old logs. A v3 group's log (`<hash>.jsonl`) has a `<hash>.auth` file next to it and an old one doesn't. This removes only the `.jsonl` files without an `.auth` partner:

   ```sh
   docker compose exec kostos sh -c 'for f in /data/*.jsonl; do [ -e "$f" ] || continue; [ -e "${f%.jsonl}.auth" ] || rm "$f"; done'
   ```

   With plain `docker run`, use `docker exec <container> sh -c '...'` with the same script. Without Docker, run it against the files directly, swapping `/data` for your `KOSTOS_DATA_DIR`. If you're unsure whether everyone has moved, leave the files alone; they cost disk space and nothing else.

A restore keeps members, categories, payment methods, trips and expenses. It doesn't keep the activity log or conflict history, and whoever restores picks which member they are again.

## Old Cloudflare rooms

On Cloudflare, the Durable Object still copies a pre-SQLite KV `history` into SQLite on first start, and reports a history that hit the old 1,000-message cap as incomplete rather than current. That only matters if you deploy over a Worker name that already holds old rooms, which v3 clients can't reach anyway. Data the server already discarded can't be recovered from it; export a full backup from a device that has the expenses and restore it as a new group.

## Coming from v1

v1 was a Next.js and SQLite app where the server could read every group. It still lives on the [`v1` branch](https://github.com/shynewt/kostos/tree/v1) for self-hosters who aren't ready to move. To move a group, export it to JSON in v1 and drop the file on `/import` of a current Kostos site. The importer maps members, categories, payment methods and every expense. Totals stay the same, but even splits can shift by a cent compared with v1, because amounts are now stored in whole cents.
