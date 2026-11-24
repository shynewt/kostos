/* RFC 4180 style CSV reader: quoted fields may hold the delimiter, line breaks and doubled
 * quotes. Accepts a BOM and any of \n, \r\n or \r as the row separator. */

export function detectDelimiter(text: string): string {
	const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? '';
	const counts = [',', ';', '\t'].map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }));
	counts.sort((a, b) => b.count - a.count);
	return counts[0].count > 0 ? counts[0].delimiter : ',';
}

export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
	const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	// a quote only opens a quoted field when nothing but spaces came before it in the field
	let fieldIsBlank = true;
	let inQuotes = false;
	let index = 0;

	const endField = () => {
		row.push(field);
		field = '';
		fieldIsBlank = true;
	};
	const endRow = () => {
		endField();
		rows.push(row);
		row = [];
	};

	while (index < text.length) {
		const char = text[index];
		if (inQuotes) {
			if (char === '"') {
				if (text[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				inQuotes = false;
			} else {
				field += char;
			}
			index++;
			continue;
		}
		if (char === '"' && fieldIsBlank) {
			field = '';
			inQuotes = true;
		} else if (char === delimiter) {
			endField();
		} else if (char === '\r' || char === '\n') {
			endRow();
			if (char === '\r' && text[index + 1] === '\n') index++;
		} else {
			field += char;
			if (fieldIsBlank && char.trim() !== '') fieldIsBlank = false;
		}
		index++;
	}
	if (field !== '' || row.length > 0) endRow();
	return rows;
}
