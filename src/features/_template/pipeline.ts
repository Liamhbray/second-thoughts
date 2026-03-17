/**
 * Feature pipeline template.
 *
 * A pipeline is the core logic of a feature — it takes input,
 * retrieves relevant notes, generates content, and writes output.
 *
 * Typical pipeline stages:
 *   1. Retrieve — find relevant notes from the index
 *   2. Filter — apply threshold, dedup, or diversity criteria
 *   3. Generate — call the LLM via services.llm.complete()
 *   4. Write — insert output into the note via vault.process()
 *
 * Example: see features/footnotes/pipeline.ts
 */

import { TFile } from "obsidian";
import { Services } from "../../core/services";
// import { filterCandidates, retrieveSimilar, cosineSimilarity } from "../../core/similarity";
// import { saveEmbeddingCache } from "../../core/embedding";
// import { generateSomething } from "./prompts";

export async function runFeaturePipeline(
	file: TFile,
	services: Services
): Promise<void> {
	const { app, settings, index, llm } = services;

	// 1. Get the note's embedding from the index
	const cached = index.get(file.path);
	if (!cached) return;

	// 2. Find candidates
	// const candidates = filterCandidates(
	//     app, file.path,
	//     settings.footnoteLinkDepth,
	//     settings.excludedFolders,
	//     settings.excludedTags,
	//     index
	// );

	// 3. Retrieve similar notes
	// const results = retrieveSimilar(cached, candidates, index, settings.topK);

	// 4. Generate content via LLM
	// const output = await llm.complete(prompt, { maxTokens: 200 });

	// 5. Check idle before writing
	if (services.getActiveFilePath() === file.path) return;
	if (services.isApiPaused()) return;

	// 6. Write atomically
	// services.addOwnWrite(file.path);
	// await app.vault.process(file, (data) => {
	//     if (services.getActiveFilePath() === file.path) return data;
	//     return data + "\n\nGenerated content\n";
	// });
}
