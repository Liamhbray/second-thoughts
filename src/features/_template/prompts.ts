/**
 * Feature prompts template.
 *
 * Each feature owns its LLM prompt templates. The LLM is called
 * via the LLMProvider interface — never directly via requestUrl.
 *
 * Pattern:
 *   1. buildPrompt() — assemble the prompt string from inputs
 *   2. generateX() — call llm.complete() and parse the response
 *
 * Tips:
 *   - Keep prompts short and specific — LLMs follow tight instructions better
 *   - Use max_tokens to constrain output length
 *   - Parse structured output with regex (e.g., [1] idea [2] idea)
 *   - Use llm.embed(text) for on-the-fly embeddings
 *   - Use llm.complete(prompt, { model: "gpt-4o" }) for model override
 *
 * Example: see features/footnotes/prompts.ts (short reason generation)
 * Example: see features/ideation/prompts.ts (multi-idea structured output)
 */

import { LLMProvider } from "../../core/llm";
// import { App, TFile } from "obsidian";

function buildPrompt(noteContent: string, context: string): string {
	return `You are analysing notes in a personal knowledge base.

Note content:
---
${noteContent}
---

Context: ${context}

[Your instructions here]`;
}

export async function generateFeatureOutput(
	noteContent: string,
	context: string,
	llm: LLMProvider
): Promise<string | null> {
	const prompt = buildPrompt(noteContent, context);
	const text = await llm.complete(prompt, { maxTokens: 200 });
	if (!text || text.trim().length === 0) return null;
	return text.trim();
}
