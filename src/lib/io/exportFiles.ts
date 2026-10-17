import type { Expense, Member, Project } from '$lib/types';
import { serializeProject, toCSV } from './projectArchive';

type DownloadableFile = { name: string; mime: string; contents: string };

function slug(value: string): string {
	const cleaned = value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
	return cleaned || 'project';
}

function fileName(project: Project, now: Date, extension: string): string {
	return `kostos-${slug(project.name)}-${now.toISOString().slice(0, 10)}.${extension}`;
}

export function backupFile(project: Project, members: Member[], expenses: Expense[], now = new Date()): DownloadableFile {
	return {
		name: fileName(project, now, 'json'),
		mime: 'application/json',
		contents: JSON.stringify(serializeProject(project, members, expenses), null, 2)
	};
}

export function spreadsheetFile(project: Project, members: Member[], expenses: Expense[], now = new Date()): DownloadableFile {
	return { name: fileName(project, now, 'csv'), mime: 'text/csv', contents: toCSV(project, members, expenses) };
}

export function saveFile({ name, mime, contents }: DownloadableFile): void {
	const url = URL.createObjectURL(new Blob([contents], { type: mime }));
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoke after the click finishes so Safari has time to start the download.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
