import { App, TFile } from "obsidian";
import {
	EmbeddingIndex,
	EmbeddingCache,
	loadAllEmbeddingCaches,
	hashPath,
} from "./embedding";
import { handleLLMError } from "./handle-llm-error";
import { notify } from "./notify";
import { BOOTSTRAP_BATCH_SIZE, BOOTSTRAP_PROGRESS_INTERVAL } from "./constants";

export interface BootstrapDeps {
	app: App;
	index: EmbeddingIndex;
	apiKey: string;
	isApiPaused: () => boolean;
	embedNote: (file: TFile) => Promise<void>;
	recordApiSuccess: () => void;
	recordApiFailure: () => void;
	recordRateLimitHit: () => void;
	pauseApi: (ms: number) => void;
}

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
		notify(
			`${staleQueue.length} notes need indexing. Set your OpenAI API key in plugin settings.`
		);
		return;
	}

	if (staleQueue.length > 0) {
		notify(`Indexing ${staleQueue.length} notes...`);
	}

	let embedded = 0;
	const total = staleQueue.length;

	outer: for (let i = 0; i < staleQueue.length; i += BOOTSTRAP_BATCH_SIZE) {
		const batch = staleQueue.slice(i, i + BOOTSTRAP_BATCH_SIZE);
		for (const file of batch) {
			if (!deps.apiKey || deps.isApiPaused()) break outer;
			try {
				await deps.embedNote(file);
				deps.recordApiSuccess();
				embedded++;
				if (embedded % BOOTSTRAP_PROGRESS_INTERVAL === 0) {
					notify(`Indexed ${embedded}/${total} notes...`);
				}
			} catch (e) {
				if (!handleLLMError(e, deps, `bootstrap embed failed for ${file.path}`)) {
					break outer;
				}
			}
		}
		if (i + BOOTSTRAP_BATCH_SIZE < staleQueue.length) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	if (total > 0) {
		const msg = embedded === total
			? `Indexing complete (${embedded} notes)`
			: `Indexed ${embedded}/${total} notes (some failed)`;
		notify(msg);
	}

	console.log(
		`Second Thoughts: bootstrap complete — ${index.size()} notes indexed`
	);
}
