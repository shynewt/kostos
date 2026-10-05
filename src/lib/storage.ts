import { browser } from '$app/environment';
import type { ProjectColor } from './types';

type Theme = 'light' | 'dark' | 'system';
type Palette = 'lime' | 'cyan' | 'violet' | 'amber' | 'coral' | 'blue';

declare global {
	interface Window {
		__kostosApplyTheme?: (next: Theme) => void;
	}
}

const KEY = {
	theme: 'kostos:theme',
	palette: 'kostos:palette',
	projects: 'kostos:projects',
	memberFor: (roomId: string) => `kostos:member_for:${roomId}`,
	// Legacy single-project keys; read once for migration, then phased out.
	legacyCurrentProject: 'kostos:current_project',
	legacyCurrentMember: 'kostos:current_member'
} as const;

export type ProjectRef = {
	/** Short, human-readable room id shown in the UI (e.g. `PRT-4F2K-9XBA`). */
	roomId: string;
	/** Secret half of the token. Lives only in the URL fragment + localStorage; never sent to the server. */
	secret: string;
	/** Display name the user gave the project. */
	name: string;
	/** Cached presentation for the projects list (refreshed on each project open). */
	emoji?: string;
	color?: ProjectColor;
	/** Unix ms of the last open; drives the project list sort. */
	lastActiveAt?: number;
	/** Your net balance in the project's base currency (cents), cached on each visit so
	 *  the home list can show it without opening every room. Positive means you are owed. */
	net?: number;
	netCurrency?: string;
	netSymbol?: string;
	/** Last server-confirmed sync, distinct from the last time the group was opened. */
	lastSyncedAt?: number | null;
};

function read(key: string): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string | null): void {
	if (!browser) return;
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// ignore quota errors and private-mode rejections
	}
}

export function getTheme(): Theme {
	const v = read(KEY.theme);
	return v === 'light' || v === 'dark' ? v : 'system';
}

export function setTheme(t: Theme): void {
	write(KEY.theme, t === 'system' ? null : t);
	if (browser) window.__kostosApplyTheme?.(t);
}

export function getPalette(): Palette {
	const p = read(KEY.palette) as Palette | null;
	return p ?? 'lime';
}

export function setPalette(p: Palette): void {
	write(KEY.palette, p);
	if (browser) document.documentElement.setAttribute('data-palette', p);
}

/* --------------------------------- Projects --------------------------------- */

function parseProjectsRaw(): ProjectRef[] | null {
	const raw = read(KEY.projects);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;
		return parsed.filter(
			(p): p is ProjectRef => p && typeof p.roomId === 'string' && typeof p.secret === 'string'
		);
	} catch {
		return null;
	}
}

function migrateLegacyIfNeeded(): ProjectRef[] | null {
	if (parseProjectsRaw() !== null) return null;
	const legacyRaw = read(KEY.legacyCurrentProject);
	if (!legacyRaw) return null;
	try {
		const legacy = JSON.parse(legacyRaw);
		if (!legacy || typeof legacy.roomId !== 'string' || typeof legacy.secret !== 'string') return null;
		const seed: ProjectRef = {
			roomId: legacy.roomId,
			secret: legacy.secret,
			name: legacy.name ?? 'Group',
			lastActiveAt: Date.now()
		};
		write(KEY.projects, JSON.stringify([seed]));

		const legacyMember = read(KEY.legacyCurrentMember);
		if (legacyMember) write(KEY.memberFor(legacy.roomId), legacyMember);

		// Old keys are no longer authoritative; drop them so future writes don't conflict.
		write(KEY.legacyCurrentProject, null);
		write(KEY.legacyCurrentMember, null);

		return [seed];
	} catch {
		return null;
	}
}

export function listProjects(): ProjectRef[] {
	const migrated = migrateLegacyIfNeeded();
	const projects = migrated ?? parseProjectsRaw() ?? [];
	return [...projects].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
}

export function findProject(roomId: string): ProjectRef | null {
	return listProjects().find((p) => p.roomId === roomId) ?? null;
}

function writeProjects(projects: ProjectRef[], critical = false): void {
	if (!critical) { write(KEY.projects, JSON.stringify(projects)); return; }
	if (!browser) return;
	try { localStorage.setItem(KEY.projects, JSON.stringify(projects)); }
	catch { throw new Error('Could not save the group invite on this device'); }
}

export function addProject(ref: ProjectRef): void {
	const existing = (parseProjectsRaw() ?? []).filter((p) => p.roomId !== ref.roomId);
	const updated: ProjectRef = {
		...ref,
		lastActiveAt: ref.lastActiveAt ?? Date.now()
	};
	writeProjects([updated, ...existing], true);
}

export function removeProject(roomId: string): void {
	const remaining = (parseProjectsRaw() ?? []).filter((p) => p.roomId !== roomId);
	writeProjects(remaining);
	write(KEY.memberFor(roomId), null);
}

export function updateProjectMetadata(
	roomId: string,
	patch: Partial<Pick<ProjectRef, 'name' | 'emoji' | 'color' | 'lastActiveAt' | 'net' | 'netCurrency' | 'netSymbol' | 'lastSyncedAt'>>
): void {
	const projects = parseProjectsRaw();
	if (!projects) return;
	let touched = false;
	const next = projects.map((p) => {
		if (p.roomId !== roomId) return p;
		const merged = { ...p, ...patch };
		// Avoid noisy writes when nothing actually changed.
		if (JSON.stringify(merged) === JSON.stringify(p)) return p;
		touched = true;
		return merged;
	});
	if (touched) writeProjects(next);
}

/* --------------------------------- Members ---------------------------------- */

export function getCurrentMember(roomId: string): string | null {
	if (!roomId) return null;
	return read(KEY.memberFor(roomId));
}

export function setCurrentMember(roomId: string, memberId: string | null): void {
	if (!roomId) return;
	write(KEY.memberFor(roomId), memberId);
}

/* --------------------------- Backward compatibility ------------------------- */

/** Shorthand for adding/promoting a project to most-recent. Pass null to forget all. */
export function setCurrentProject(ref: ProjectRef | null): void {
	if (ref === null) {
		writeProjects([]);
		return;
	}
	addProject(ref);
}
