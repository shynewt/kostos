# Running a Kostos server

Setup is in the [README](../README.md#self-hosting). This page covers what to know once a server is running.

## How rooms are stored

The relay addresses each room by a 64-character hex ID derived from the group key. The first client to connect stores a hash of its access proof, and any other proof gets a `denied` message and a 1008 close. The Node relay keeps that hash in `<hash>.auth` next to the room log `<hash>.jsonl`, where the file name is the SHA-256 of the relay room ID. Encrypted history is appended to the log and flushed to disk before a write is acknowledged.

## Limits and operating notes

- Run one server process per data directory. Room claims aren't locked across processes, so two processes sharing a directory can split a room.
- A room refuses writes once it holds 32 MiB of live history or 100,000 live entries, whichever comes first. The app then says "This group is full, so new changes stay on this phone. Export a backup from the Group tab and restore it as a new group." and retries about every five minutes, or when someone taps Try again. A full group can still be exported and restored.
- On Cloudflare, the Durable Object frees live space when a synced device compacts its history. The replaced entries move to an archive capped at another 32 MiB, and once that's full its oldest entries are dropped to make room.
- The Node relay never compacts, so its caps are permanent. A group that reaches them needs a backup exported from the Group tab and restored as a new group.
- Neither relay prunes its live history on its own, so keep an eye on disk and storage use on long-running servers. Messages over 1 MiB fail explicitly and don't get a successful acknowledgement.
- The code only limits what a single room can do. The Node relay keeps one small `.auth` file per room and anyone can create rooms, so put a rate limit on `/sync/` in front of a public server (nginx `limit_req`, Traefik's `rateLimit` middleware, or a Cloudflare rule on `/sync/*`).
- Whoever knows a relay room ID before the group's first connection can claim it; after that, only the group's proof gets in. Until that first connection, you're trusting the operator.
- The Docker `HEALTHCHECK` follows `PORT` but always probes `127.0.0.1`.
