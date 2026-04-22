import { TFile, MarkdownView, App } from "obsidian";
import { notify } from "./notify";

interface CalloutRange {
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
			const from = pos;
			let to = pos + line.length;

			let j = i + 1;
			while (j < lines.length && lines[j].startsWith("> ")) {
				to += 1 + lines[j].length;
				j++;
			}

			callouts.push({ from, to });
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

async function processActiveCallout(
	app: App,
	transform: (data: string) => string,
	action: string
): Promise<void> {
	const file = app.workspace.getActiveViewOfType(MarkdownView)?.file;
	if (!file) return;
	try {
		await app.vault.process(file, (data) => transform(data));
	} catch (e) {
		console.error(`Second Thoughts: ${action} failed`, e);
		notify(`could not ${action} proposal.`);
	}
}

export function handleAccept(app: App, from: number, to: number): Promise<void> {
	return processActiveCallout(app, (data) => {
		const [, ...lines] = data.slice(from, to).split("\n");
		const content = lines.map((l) => l.replace(/^>\s?/, "")).join("\n").trim();
		return data.slice(0, from) + content + data.slice(to);
	}, "accept");
}

export function handleReject(app: App, from: number, to: number): Promise<void> {
	return processActiveCallout(app, (data) => {
		let start = from;
		let end = to;
		while (end < data.length && data[end] === "\n") end++;
		if (start > 0 && data[start - 1] === "\n") {
			start--;
			if (start > 0 && data[start - 1] === "\n") start--;
		}
		return data.slice(0, start) + data.slice(end);
	}, "reject");
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
		notify("could not reject proposals.");
	}
}
