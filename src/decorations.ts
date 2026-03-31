import { StateEffect } from "@codemirror/state";

// --- Effects (consumed by Phase 7b to trigger vault.process) ---

export const acceptCallout = StateEffect.define<{ from: number; to: number }>();
export const rejectCallout = StateEffect.define<{ from: number; to: number }>();

// --- Callout detection ---

interface CalloutRange {
	type: "connection" | "ideation";
	from: number;
	to: number;
}

function findCallouts(text: string): CalloutRange[] {
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

			// Consume continuation lines starting with `> `
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

export { findCallouts };

// --- Footnote utilities ---

const ST_MARKER = "*(Second Thoughts)*";
const ST_PREFIX = "st-";

/**
 * Find the next available `[^st-N]` footnote ID in the given text.
 */
export function nextFootnoteId(text: string): string {
	let max = 0;
	const re = /\[\^st-(\d+)\]/g;
	let m;
	while ((m = re.exec(text)) !== null) {
		const n = parseInt(m[1], 10);
		if (n > max) max = n;
	}
	return `st-${max + 1}`;
}

/**
 * Build a footnote reference and definition from a proposal.
 */
export function formatFootnote(
	id: string,
	targetName: string,
	reason: string
): { ref: string; def: string } {
	return {
		ref: `[^${id}]`,
		def: `[^${id}]: See [[${targetName}]] — ${reason} ${ST_MARKER}`,
	};
}

/**
 * Check if a footnote definition line contains the Second Thoughts marker.
 */
export function isSecondThoughtsFootnote(line: string): boolean {
	return line.includes(ST_MARKER);
}

/**
 * Strip the Second Thoughts marker from a footnote definition.
 */
export function stripFootnoteMarker(text: string, id: string): string {
	const defRe = new RegExp(
		`(\\[\\^${id}\\]:.*?)\\s*\\*\\(Second Thoughts\\)\\*`,
		"m"
	);
	return text.replace(defRe, "$1");
}

/**
 * Remove a footnote entirely — both inline reference and definition.
 */
export function removeFootnote(text: string, id: string): string {
	// Remove inline references
	const refRe = new RegExp(`\\[\\^${id}\\](?!:)`, "g");
	let result = text.replace(refRe, "");

	// Remove definition line
	const defRe = new RegExp(`^\\[\\^${id}\\]:.*\\n?`, "m");
	result = result.replace(defRe, "");

	return result;
}
