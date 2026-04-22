import { App, TFile } from "obsidian";
import { LLMProvider } from "../../core/llm";

function buildBridgingPrompt(
	selectionText: string,
	userInstruction: string,
	diverseNotes: { title: string; content: string }[],
	ideaCount: number
): string {
	const noteBlocks = diverseNotes
		.map((n) => `"${n.title}": ${n.content.substring(0, 800)}`)
		.join("\n\n");

	return `The user has these notes:

${noteBlocks}

They selected this passage:
"${selectionText}"
${userInstruction ? `\nThey ask: ${userInstruction}\n` : ""}
Suggest ${ideaCount} novel ideas that emerge from combining these notes in unexpected ways. Each idea should be ONE sentence that connects at least 2 notes the user hasn't linked. Use [[NoteTitle]] wikilinks.

Format:
${Array.from({ length: ideaCount }, (_, i) => `[${i + 1}] idea`).join("\n")}`;
}

/**
 * Generate cross-cluster bridging ideas from diverse vault notes.
 */
export async function generateBridgingIdeas(
	selectionText: string,
	userInstruction: string,
	diverseNotePaths: string[],
	llm: LLMProvider,
	model: string,
	ideaCount: number,
	app: App
): Promise<string[] | null> {
	const diverseNotes: { title: string; content: string }[] = [];
	for (const path of diverseNotePaths) {
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const content = await app.vault.read(file);
			diverseNotes.push({ title: file.basename, content });
		}
	}

	if (diverseNotes.length === 0) return null;

	const prompt = buildBridgingPrompt(
		selectionText,
		userInstruction,
		diverseNotes,
		ideaCount
	);
	const text = await llm.complete(prompt, {
		maxTokens: ideaCount * 100,
		model,
	});
	if (!text || text.trim().length === 0) return null;

	const ideas = text
		.split(/\[\d+\]\s*/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((idea) => validateWikilinks(idea, app));

	return ideas.length > 0 ? ideas : null;
}

/**
 * Validate [[wikilinks]] in an idea string against the vault.
 * Unresolvable links are stripped to plain text.
 */
export function validateWikilinks(idea: string, app: App): string {
	return idea.replace(/\[\[([^\]]+)\]\]/g, (match, linkText: string) => {
		const resolved = app.metadataCache.getFirstLinkpathDest(
			linkText,
			""
		);
		return resolved ? match : linkText;
	});
}
