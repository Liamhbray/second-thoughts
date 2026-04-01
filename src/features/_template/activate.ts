/**
 * Feature: [Feature Name]
 *
 * This is a template for adding new features to Second Thoughts.
 * Copy this folder, rename it, and implement the TODOs.
 *
 * Architecture:
 *   - activate.ts  — registers commands, events, post-processors
 *   - pipeline.ts  — core logic (retrieval → generation → write)
 *   - prompts.ts   — LLM prompt templates
 *
 * To wire in:
 *   1. Import { activateFeatureName } from "./features/feature-name/activate"
 *   2. Call activateFeatureName(this, services) in main.ts onload()
 *
 * Available via Services:
 *   - services.app                   — Obsidian App (vault, workspace, metadataCache)
 *   - services.settings              — Plugin settings (SecondThoughtsSettings)
 *   - services.index                 — EmbeddingIndex (in-memory note → vector cache)
 *   - services.llm                   — LLMProvider (complete, embed, embedBatch)
 *   - services.idle                  — IdleDetector (addHandler to run on note idle)
 *   - services.isBootstrapComplete() — True after all notes have been indexed
 *   - services.getActiveFilePath()   — Current active file path (or null)
 *   - services.isApiPaused()         — True if API is in backoff after failures
 *   - services.recordApiSuccess()    — Reset failure counter
 *   - services.recordApiFailure()    — Increment failure counter (pauses at 5)
 *   - services.addOwnWrite(path)     — Mark a file write as plugin-owned (skips idle timer)
 *   - services.embedNote(file)       — Embed a note's compartments and update the index
 *
 * Available from core/:
 *   - core/llm.ts        — LLMProvider interface, OpenAIProvider class
 *   - core/embedding.ts  — EmbeddingIndex, ShadowFile, extractCompartments,
 *                           embedCompartments, saveShadowFile, loadAllShadowFiles
 *   - core/similarity.ts — cosineSimilarity, scopeBFS, filterCandidates,
 *                           retrieveSimilar, selectDiverseResults (MMR)
 *   - core/settings.ts   — SecondThoughtsSettings, DEFAULT_SETTINGS
 *   - core/services.ts   — Services interface
 *
 * Rules:
 *   - Never import from another feature (features/ siblings)
 *   - Only import from core/ and obsidian
 *   - Use services.llm for all LLM calls (swappable provider)
 *   - Use vault.process() for all file writes (atomic)
 *   - Use requestUrl() for any custom network calls (not fetch)
 *   - Use createEl() for all DOM creation (not innerHTML)
 *   - Don't use "selection" as a property name on Modal subclasses (reserved by Obsidian)
 */

import { Plugin } from "obsidian";
import { Services } from "../../core/services";

export function activateFeatureName(
	plugin: Plugin,
	services: Services
): void {
	// --- Commands ---
	// Register commands the user can invoke from the palette.
	//
	// plugin.addCommand({
	//     id: "my-feature",
	//     name: "Do something",
	//     editorCallback: (editor, view) => {
	//         // editor.getSelection() — highlighted text
	//         // editor.getCursor() — cursor position
	//         // editor.replaceRange(text, pos) — insert text
	//         // view.file — current TFile
	//     },
	// });

	// --- Event handlers ---
	// React to vault or workspace events.
	//
	// plugin.registerEvent(
	//     services.app.vault.on("modify", (file) => { ... })
	// );
	//
	// plugin.registerEvent(
	//     services.app.workspace.on("layout-change", () => { ... })
	// );

	// --- Post-processors ---
	// Modify rendered markdown in reading mode.
	//
	// plugin.registerMarkdownPostProcessor((el, ctx) => {
	//     // el — the rendered HTML element
	//     // ctx.sourcePath — the file path
	//     // Note: post-processors don't receive <section class="footnotes">
	// });
}
