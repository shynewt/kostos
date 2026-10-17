import { isValidSecret } from './invite';

/* Groups made before v3 hold a 32 byte secret (43 base64url characters). Their server rooms were
 * addressed differently, so they can no longer sync; they stay readable from the data on the device
 * until someone exports and restores them as a new group. Any stored secret that is not a valid
 * current one is treated the same way, whatever its length. */
export function isLegacySecret(secret: string): boolean {
	return !isValidSecret(secret);
}
