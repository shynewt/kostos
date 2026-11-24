/** A group name guessed from the export's file name: "weekend-in-lisbon_2024-05-31_export.csv"
 *  becomes "Weekend in lisbon". Falls back to a generic name when nothing is left. */
export function groupNameFromFileName(fileName: string): string {
	const words = fileName
		.replace(/\.csv$/i, '')
		.replace(/\(\d+\)$/, '')
		.replace(/\d{4}-\d{2}-\d{2}/g, ' ')
		.replace(/[_-]+/g, ' ')
		.replace(/\bexport\b/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!words) return 'Splitwise group';
	return words[0].toUpperCase() + words.slice(1);
}
