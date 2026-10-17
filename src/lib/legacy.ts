/* Groups made before v3 hold a 32 byte secret (43 base64url characters). Their server rooms were
 * addressed differently, so they can no longer sync; they stay readable from the data on the device
 * until someone exports and restores them as a new group. */
const LEGACY_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isLegacySecret(secret: string): boolean {
	return LEGACY_SECRET_PATTERN.test(secret);
}
