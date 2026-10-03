import { describe, expect, it } from 'vitest';
import { parseToken } from './token';

const expected = { roomId: 'PRT-AB23-CD45', secret: 'Wk3y_-SecretWithEnoughLength0123456789abcd' };

describe('parseToken', () => {
	it('reads the share link the app hands out', () => {
		expect(parseToken('https://kostos.app/join?room=PRT-AB23-CD45#Wk3y_-SecretWithEnoughLength0123456789abcd')).toEqual(expected);
	});

	it('reads a percent-encoded room and a relative link', () => {
		expect(parseToken('/join?room=PRT%2DAB23%2DCD45#Wk3y_-SecretWithEnoughLength0123456789abcd')).toEqual(expected);
	});

	it('reads links pasted without a scheme, wrapped, or inside a sentence', () => {
		const link = 'kostos.app/join?room=PRT-AB23-CD45#Wk3y_-SecretWithEnoughLength0123456789abcd';
		expect(parseToken(link)).toEqual(expected);
		expect(parseToken(`<https://${link}>`)).toEqual(expected);
		expect(parseToken(`Join us here: https://${link}.`)).toEqual(expected);
		expect(parseToken(`(https://${link})`)).toEqual(expected);
	});

	it('reads the bare ROOM.SECRET form', () => {
		expect(parseToken('  prt-ab23-cd45.Wk3y_-SecretWithEnoughLength0123456789abcd ')).toEqual(expected);
	});

	it('reads the older #ROOM.SECRET link form', () => {
		expect(parseToken('https://kostos.app/join#PRT-AB23-CD45.Wk3y_-SecretWithEnoughLength0123456789abcd')).toEqual(expected);
	});

	it('rejects links missing the room or the secret', () => {
		expect(parseToken('https://kostos.app/join?room=PRT-AB23-CD45')).toBeNull();
		expect(parseToken('https://kostos.app/join#Wk3y_-SecretWithEnoughLength0123456789abcd')).toBeNull();
		expect(parseToken('PRT-AB23-CD45')).toBeNull();
		expect(parseToken('')).toBeNull();
	});

	it('rejects malformed rooms and short secrets', () => {
		const secret = 'Wk3y_-SecretWithEnoughLength0123456789abcd';
		expect(parseToken(`PRT-AB23.${secret}`)).toBeNull();
		expect(parseToken(`PRT-AB2I-CD45.${secret}`)).toBeNull();
		expect(parseToken('PRT-AB23-CD45.short')).toBeNull();
		expect(parseToken(`PRT-AB23-CD45.${secret}<script>`)).toBeNull();
	});
});
