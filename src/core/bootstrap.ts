import { App, Notice, TFile } from "obsidian";
import {
	EmbeddingIndex,
	EmbeddingCache,
	loadAllEmbeddingCaches,
	hashPath,
} from "./embedding";
import { LLMError } from "./llm";

export interface BootstrapDeps {
	app: App;
	index: EmbeddingIndex;
	apiKey: string;
	isApiPaused: () => boolean;
	embedNote: (file: TFile) => Promise<void>;
	recordApiSuccess: () => void;
	recordApiFailure: () => void;
	pauseApi: (ms: number) => void;
}

const AUTH_FAILURE_PAUSE_MS = 10 * 60_000;

/**
 * Load embedding caches, detect stale notes, and re-embed them.
 */
export async function runBootstrap(deps: BootstrapDeps): Promise<void> {
	const { app, index } = deps;

	// Wait for metadataCache to resolve
	const alreadyResolved =
		Object.keys(app.metadataCache.resolvedLinks).length > 0;
	if (!alreadyResolved) {
		await new Promise<void>((resolve) => {
			const ref = app.metadataCache.on("resolved", () => {
				app.metadataCache.offref(ref);
				resolve();
			});
		});
	}

	const cacheMap = await loadAllEmbeddingCaches(app);
	const allNotes = app.vault.getMarkdownFiles();
	const staleQueue: TFile[] = [];

	for (const note of allNotes) {
		const hash = hashPath(note.path);
		const cacheKey = [...cacheMap.keys()].find((k) =>
			k.endsWith(`/${hash}.json`)
		);

		if (cacheKey) {
			const cached = cacheMap.get(cacheKey)!;
			index.set(note.path, cached);
			if (cached.mtime !== note.stat.mtime) {
				staleQueue.push(note);
			}
			cacheMap.delete(cacheKey);
		} else {
			staleQueue.push(note);
		}
	}

	staleQueue.sort((a, b) => b.stat.mtime - a.stat.mtime);

	console.log(
		`Second Thoughts: bootstrap — ${index.size()} cached, ${staleQueue.length} to embed`
	);

	if (staleQueue.length > 0 && !deps.apiKey) {
		new Notice(
			`Second Thoughts: ${staleQueue.length} notes need indexing. Set your OpenAI API key in plugin settings.`
		);
		return;
	}

	if (staleQueue.length > 0) {
		new Notice(
			`Second Thoughts: Indexing ${staleQueue.length} notes...`
		);
	}

	let embedded = 0;
	const total = staleQueue.length;

	const BATCH_SIZE = 50;
	outer: for (let i = 0; i < staleQueue.length; i += BATCH_SIZE) {
		const batch = staleQueue.slice(i, i + BATCH_SIZE);
		for (const file of batch) {
			if (!deps.apiKey || deps.isApiPaused()) break outer;
			try {
				await deps.embedNote(file);
				deps.recordApiSuccess();
				embedded++;
				if (embedded % 10 === 0) {
					new Notice(
						`Second Thoughts: Indexed ${embedded}/${total} notes...`
					);
				}
			} catch (e) {
				if (e instanceof LLMError && e.kind === "auth") {
					deps.pauseApi(AUTH_FAILURE_PAUSE_MS);
					new Notice(
						"Second Thoughts: API key rejected. Check plugin settings."
					);
					break outer;
				}
				deps.recordApiFailure();
				if (
					e instanceof LLMError &&
					(e.kind === "rate_limit" || e.kind === "network")
				) {
					new Notice(
						`Second Thoughts: Embedding failed (${e.kind}) — ${file.path}`
					);
				}
				console.error(
					`Second Thoughts: bootstrap embed failed for ${file.path}`,
					e
				);
			}
		}
		if (i + BATCH_SIZE < staleQueue.length) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	if (total > 0) {
		new Notice(`Second Thoughts: Indexing complete (${total} notes)`);
	}

	console.log(
		`Second Thoughts: bootstrap complete — ${index.size()} notes indexed`
	);
}
