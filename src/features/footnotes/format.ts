const ST_MARKER = "*(Second Thoughts)*";

/**
 * Find the next available [^st-N] footnote ID in the given text.
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
	const refRe = new RegExp(`\\[\\^${id}\\](?!:)`, "g");
	let result = text.replace(refRe, "");

	const defRe = new RegExp(`^\\[\\^${id}\\]:.*\\n?`, "m");
	result = result.replace(defRe, "");

	return result;
}
