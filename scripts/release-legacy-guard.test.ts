/* Runs the "Refuse to ship placeholders" step of release-legacy.yml against fake migration files. */
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

async function guardScript(): Promise<string> {
	const workflow = await readFile(new URL('../.github/workflows/release-legacy.yml', import.meta.url), 'utf8');
	const step = workflow.match(/- name: Refuse to ship placeholders\n\s+run: \|\n((?:\s{10}.*\n)+)/);
	if (!step) throw new Error('The placeholder guard step is missing from release-legacy.yml');
	return step[1].replace(/^ {10}/gm, '');
}

async function runGuard(migration: string | null) {
	const directory = await mkdtemp(join(tmpdir(), 'kostos-guard-'));
	directories.push(directory);
	if (migration !== null) {
		await mkdir(join(directory, 'src/lib'), { recursive: true });
		await writeFile(join(directory, 'src/lib/migration.ts'), migration);
	}
	// GitHub runs `run:` blocks with bash -e
	return spawnSync('bash', ['-e', '-c', await guardScript()], { cwd: directory, encoding: 'utf8' });
}

const migration = (host: string, date: string) => `export const APP_HOST = ${host};\nexport const RETIREMENT_DATE = ${date};\n`;

describe('release-legacy placeholder guard', () => {
	it('lets real values through, whichever quotes they use', async () => {
		expect((await runGuard(migration("'kostos.app'", "'2027-02-01'"))).status).toBe(0);
		expect((await runGuard(migration('"kostos.app"', '"2027-02-01"'))).status).toBe(0);
	});

	it('refuses single-quoted placeholders', async () => {
		const result = await runGuard(migration("'APP_DOMAIN'", "'RETIREMENT_DATE'"));
		expect(result.status).toBe(1);
		expect(result.stdout + result.stderr).toContain('Set APP_HOST and RETIREMENT_DATE');
	});

	it('refuses double-quoted placeholders', async () => {
		expect((await runGuard(migration('"APP_DOMAIN"', '"RETIREMENT_DATE"'))).status).toBe(1);
	});

	it('refuses when only one of the two is still a placeholder', async () => {
		expect((await runGuard(migration("'kostos.app'", '"RETIREMENT_DATE"'))).status).toBe(1);
		expect((await runGuard(migration('"APP_DOMAIN"', "'2027-02-01'"))).status).toBe(1);
	});

	it('fails when the migration file is missing', async () => {
		expect((await runGuard(null)).status).not.toBe(0);
	});
});
