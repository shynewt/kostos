export function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}
