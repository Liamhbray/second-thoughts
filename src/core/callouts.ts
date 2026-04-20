import { TFile, MarkdownView, Notice, App } from "obsidian";

interface CalloutRange {
	type: "connection" | "ideation";
	from: number;
	to: number;
}

export function findCallouts(text: string): CalloutRange[] {
	const callouts: CalloutRange[] = [];
	const lines = text.split("\n");
	let pos = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^>\s*\[!(connection|ideation)\]\s*$/);

		if (match) {
			const type = match[1] as "connection" | "ideation";
			const from = pos;
			let to = pos + line.length;

			let j = i + 1;
			while (j < lines.length && lines[j].startsWith("> ")) {
				to += 1 + lines[j].length;
				j++;
			}

			callouts.push({ type, from, to });
		}

		pos += line.length + 1;
	}

	return callouts;
}

export function findCalloutAtLine(
	content: string,
	line: number
): { from: number; to: number } | null {
	const callouts = findCallouts(content);
	const lines = content.split("\n");
	let pos = 0;
	for (let i = 0; i < line && i < lines.length; i++) {
		pos += lines[i].length + 1;
	}
	for (const c of callouts) {
		if (pos >= c.from && pos <= c.to) {
			return { from: c.from, to: c.to };
		}
	}
	return null;
}

export async function handleAccept(
	app: App,
	from: number,
	to: number
): Promise<void> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) return;
	try {
		await app.vault.process(file, (data) => {
			const block = data.slice(from, to);
			const lines = block.split("\n");
			const contentLines: string[] = [];
			for (let i = 0; i < lines.length; i++) {
				if (i === 0) continue;
				contentLines.push(lines[i].replace(/^>\s?/, ""));
			}
			const plainContent = contentLines.join("\n").trim();
			return data.slice(0, from) + plainContent + data.slice(to);
		});
	} catch (e) {
		console.error("Second Thoughts: accept failed", e);
		new Notice("Second Thoughts: could not accept proposal.");
	}
}

export async function handleReject(
	app: App,
	from: number,
	to: number
): Promise<void> {
	const view = app.workspace.getActiveViewOfType(MarkdownView);
	const file = view?.file;
	if (!file) return;
	try {
		await app.vault.process(file, (data) => {
			let start = from;
			let end = to;
			while (end < data.length && data[end] === "\n") end++;
			if (start > 0 && data[start - 1] === "\n") {
				start--;
				if (start > 0 && data[start - 1] === "\n") start--;
			}
			return data.slice(0, start) + data.slice(end);
		});
	} catch (e) {
		console.error("Second Thoughts: reject failed", e);
		new Notice("Second Thoughts: could not reject proposal.");
	}
}

export async function handleRejectAll(
	app: App,
	file: TFile
): Promise<void> {
	try {
		await app.vault.process(file, (data) => {
			const callouts = findCallouts(data);
			if (callouts.length === 0) return data;
			let result = data;
			for (let i = callouts.length - 1; i >= 0; i--) {
				const c = callouts[i];
				let start = c.from;
				let end = c.to;
				while (end < result.length && result[end] === "\n") end++;
				if (start > 0 && result[start - 1] === "\n") {
					start--;
					if (start > 0 && result[start - 1] === "\n") start--;
				}
				result = result.slice(0, start) + result.slice(end);
			}
			return result;
		});
	} catch (e) {
		console.error("Second Thoughts: reject-all failed", e);
		new Notice("Second Thoughts: could not reject proposals.");
	}
}
