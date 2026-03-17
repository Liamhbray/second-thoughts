import { LLMProvider } from "../../core/llm";
import { App, TFile } from "obsidian";

export interface FootnoteProposal {
	targetPath: string;
	targetName: string;
	reason: string;
}

function buildFootnotePrompt(
	noteContent: string,
	notePath: string,
	targetName: string,
	targetContent: string
): string {
	return `You are analysing connections between notes in a personal knowledge base.

Source note (${notePath}):
---
${noteContent}
---

Related note: "${targetName}"
---
${targetContent}
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
	const targetFile = app.vault.getAbstractFileByPath(targetPath);
	if (!(targetFile instanceof TFile)) return null;

	const targetContent = await app.vault.read(targetFile);
	const targetName = targetFile.basename;

	const prompt = buildFootnotePrompt(
		noteContent,
		notePath,
		targetName,
		targetContent
	);
	const reason = await llm.complete(prompt, { maxTokens: 80 });
	if (!reason) return null;

	return {
		targetPath,
		targetName,
		reason: reason.replace(/\n/g, " ").trim(),
	};
}
