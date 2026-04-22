import { LLMProvider } from "../../core/llm";
import {
	FOOTNOTE_REASON_MAX_CHARS,
	FOOTNOTE_PROMPT_BODY_MAX_CHARS,
} from "../../core/constants";
import { extractCompartments } from "../../core/embedding";
import { App, TFile } from "obsidian";

export interface FootnoteProposal {
	targetPath: string;
	targetName: string;
	reason: string;
}

function summariseNote(file: TFile, content: string, app: App): string {
	const cache = app.metadataCache.getFileCache(file);
	const c = extractCompartments(file, content, cache);
	const parts = [`Title: ${c.title}`];
	if (c.tags) parts.push(`Tags: ${c.tags}`);
	if (c.links) parts.push(`Links: ${c.links}`);
	parts.push(c.content.substring(0, FOOTNOTE_PROMPT_BODY_MAX_CHARS));
	return parts.join("\n");
}

function buildFootnotePrompt(
	sourceSummary: string,
	targetSummary: string
): string {
	return `You are analysing connections between notes in a personal knowledge base.

Source note:
---
${sourceSummary}
---

Related note:
---
${targetSummary}
---

In ONE short sentence (under 30 words), explain why these notes are related. Be specific. No formatting or markdown — just the plain text reason.`;
}

export async function generateFootnoteReason(
	noteContent: string,
	notePath: string,
	targetPath: string,
	llm: LLMProvider,
	app: App
): Promise<FootnoteProposal | null> {
	const sourceFile = app.vault.getAbstractFileByPath(notePath);
	const targetFile = app.vault.getAbstractFileByPath(targetPath);
	if (!(sourceFile instanceof TFile) || !(targetFile instanceof TFile))
		return null;

	const targetContent = await app.vault.read(targetFile);

	const prompt = buildFootnotePrompt(
		summariseNote(sourceFile, noteContent, app),
		summariseNote(targetFile, targetContent, app)
	);
	const reason = await llm.complete(prompt, { maxTokens: 80 });
	if (!reason) return null;

	return {
		targetPath,
		targetName: targetFile.basename,
		reason: reason
			.replace(/\n/g, " ")
			.replace(/[*_`]/g, "")
			.replace(/\s{2,}/g, " ")
			.trim()
			.substring(0, FOOTNOTE_REASON_MAX_CHARS),
	};
}
