/** Running payload totals in sync_meta: summing rows bills a read per row, so writes adjust these instead.
 *  Kept apart from sync-do.ts so tests can name the keys without loading the Workers runtime. */
export const LIVE_BYTES = 'live_bytes';
export const ARCHIVE_BYTES = 'archive_bytes';
