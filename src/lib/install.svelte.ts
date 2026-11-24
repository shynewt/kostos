/* Android and desktop Chromium show their own install prompt as long as the page leaves the
 * beforeinstallprompt event alone, so Kostos does. iOS has no install prompt at all, so iPhone and
 * iPad visitors get a hint pointing at Share, then Add to Home Screen. */
import { browser } from '$app/environment';

const DISMISSED_KEY = 'kostos:ios-install-hint-dismissed';

class IosInstallHint {
	visible = $state(false);

	check(): void {
		if (!browser) return;
		const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
		this.visible = isIos() && !standalone && !readDismissed();
	}

	dismiss(): void {
		this.visible = false;
		try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* the hint just comes back next visit */ }
	}
}

function readDismissed(): boolean {
	try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

// iPadOS reports itself as a Mac, so a touch screen gives it away
function isIos(): boolean {
	return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

export const iosInstallHint = new IosInstallHint();
