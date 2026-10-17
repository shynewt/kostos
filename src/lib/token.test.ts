import { describe, expect, it } from 'vitest';
import { generateSecret, inviteError, INVALID_INVITE_MESSAGE, isOldInvite, isValidSecret, OLD_INVITE_MESSAGE, parseToken } from './token';

const secret = 'AAECAwQFBgcICQoLDA0ODw';
const legacySecret = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

describe('parseToken', () => {
	it('reads the share link the app hands out', () => {
		expect(secret).toHaveLength(22);
		expect(parseToken(`https://kostos.example/join#${secret}`)).toEqual({ secret });
	});

	it('reads links pasted without a scheme, wrapped, or inside a sentence', () => {
		const link = `kostos.example/join#${secret}`;
		expect(parseToken(link)).toEqual({ secret });
		expect(parseToken(`<https://${link}>`)).toEqual({ secret });
		expect(parseToken(`Join us here: https://${link}.`)).toEqual({ secret });
		expect(parseToken(`(https://${link})`)).toEqual({ secret });
	});

	it('reads the bare key and keeps its case', () => {
		expect(parseToken(`  ${secret} `)).toEqual({ secret });
		expect(parseToken('abc-_ABC-_abc-_ABC-_ab')).toEqual({ secret: 'abc-_ABC-_abc-_ABC-_ab' });
	});

	it('keeps keys that end in - or _', () => {
		expect(parseToken('https://kostos.example/join#abcdefghijklmnopqrst-_')).toEqual({ secret: 'abcdefghijklmnopqrst-_' });
	});

	it('rejects the old link and key forms', () => {
		expect(legacySecret).toHaveLength(43);
		expect(parseToken(`https://kostos.example/join?room=PRT-AB23-CD45#${legacySecret}`)).toBeNull();
		expect(parseToken(`PRT-AB23-CD45.${legacySecret}`)).toBeNull();
		expect(parseToken(legacySecret)).toBeNull();
		expect(parseToken('PRT-AB23-CD45')).toBeNull();
	});

	it('rejects links without a key, wrong lengths and stray characters', () => {
		expect(parseToken('https://kostos.example/join')).toBeNull();
		expect(parseToken(secret.slice(1))).toBeNull();
		expect(parseToken(`${secret}x`)).toBeNull();
		expect(parseToken(`${secret}<script>`)).toBeNull();
		expect(parseToken('')).toBeNull();
	});
});

describe('old invites', () => {
	it('recognises every form the old site produced', () => {
		expect(isOldInvite(`https://kostos.example/join?room=PRT-AB23-CD45#${legacySecret}`)).toBe(true);
		expect(isOldInvite('Join: https://kostos.example/join?room=PRT-AB23-CD45 please')).toBe(true);
		expect(isOldInvite(`https://kostos.example/join#PRT-AB23-CD45.${legacySecret}`)).toBe(true);
		expect(isOldInvite(`PRT-AB23-CD45.${legacySecret}`)).toBe(true);
		expect(isOldInvite(legacySecret)).toBe(true);
	});

	it('does not flag current invites or plain mistakes', () => {
		expect(isOldInvite(`https://kostos.example/join#${secret}`)).toBe(false);
		expect(isOldInvite(secret)).toBe(false);
		expect(isOldInvite('https://kostos.example/join')).toBe(false);
		expect(isOldInvite('hello')).toBe(false);
		expect(isOldInvite('')).toBe(false);
	});

	it('answers an old invite with a message that says it is from the old site', () => {
		expect(inviteError(legacySecret)).toBe(OLD_INVITE_MESSAGE);
		expect(OLD_INVITE_MESSAGE).toContain('old Kostos site');
		expect(inviteError('hello')).toBe(INVALID_INVITE_MESSAGE);
	});
});

describe('generateSecret', () => {
	it('makes valid, distinct 22 character secrets', () => {
		const first = generateSecret();
		expect(first).toHaveLength(22);
		expect(isValidSecret(first)).toBe(true);
		expect(generateSecret()).not.toBe(first);
	});
});
