import { TFile, CachedMetadata, App } from "obsidian";
import { LLMProvider } from "./llm";

export interface EmbeddingCache {
	mtime: number;
	title: number[];
	tags: number[];
	links: number[];
	content: number[];
	proposed: string[];
}

export interface Compartments {
	title: string;
	tags: string;
	links: string;
	content: string;
}

const EMBEDDINGS_DIR = ".obsidian/plugins/second-thoughts/embeddings";

// --- Compartment extraction ---

export function extractCompartments(
	file: TFile,
	content: string,
	cache: CachedMetadata | null
): Compartments {
	const title = file.basename;

	const tagSet: string[] = [];
	if (cache?.tags) {
		for (const t of cache.tags) {
			tagSet.push(t.tag);
		}
	}
	if (cache?.frontmatter?.tags) {
		const fmTags = cache.frontmatter.tags;
		if (Array.isArray(fmTags)) {
			for (const t of fmTags) {
				tagSet.push(String(t));
			}
		}
	}

	const linkSet: string[] = [];
	if (cache?.links) {
		for (const l of cache.links) {
			const display = l.displayText || l.link;
			if (!l.link.startsWith("#")) {
				linkSet.push(display);
			}
		}
	}
	if (cache?.frontmatterLinks) {
		for (const l of cache.frontmatterLinks) {
			linkSet.push(l.displayText || l.link);
		}
	}

	return {
		title,
		tags: tagSet.join(", "),
		links: linkSet.join(", "),
		content,
	};
}

// --- Embedding ---

export async function embedCompartments(
	compartments: Compartments,
	llm: LLMProvider
): Promise<{ title: number[]; tags: number[]; links: number[]; content: number[] }> {
	const texts = [
		compartments.title,
		compartments.tags,
		compartments.links,
		compartments.content,
	];
	const vectors = await llm.embedBatch(texts);
	return {
		title: vectors[0],
		tags: vectors[1],
		links: vectors[2],
		content: vectors[3],
	};
}

// --- Embedding cache I/O ---

export function hashPath(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		const char = path.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36);
}

export async function saveEmbeddingCache(
	app: App,
	notePath: string,
	cached: EmbeddingCache
): Promise<void> {
	const hash = hashPath(notePath);
	const cachePath = `${EMBEDDINGS_DIR}/${hash}.json`;
	if (!(await app.vault.adapter.exists(EMBEDDINGS_DIR))) {
		await app.vault.adapter.mkdir(EMBEDDINGS_DIR);
	}
	await app.vault.adapter.write(cachePath, JSON.stringify(cached));
}

export async function loadAllEmbeddingCaches(
	app: App
): Promise<Map<string, EmbeddingCache>> {
	const map = new Map<string, EmbeddingCache>();
	try {
		const files = await app.vault.adapter.list(EMBEDDINGS_DIR);
		for (const filePath of files.files) {
			if (!filePath.endsWith(".json")) continue;
			try {
				const raw = await app.vault.adapter.read(filePath);
				map.set(filePath, JSON.parse(raw));
			} catch {
				// Skip corrupt files
			}
		}
	} catch {
		// Directory may not exist yet
	}
	return map;
}

// --- Runtime index ---

export class EmbeddingIndex {
	private entries = new Map<string, EmbeddingCache>();

	set(path: string, cached: EmbeddingCache): void {
		this.entries.set(path, cached);
	}

	get(path: string): EmbeddingCache | undefined {
		return this.entries.get(path);
	}

	size(): number {
		return this.entries.size;
	}

	delete(path: string): void {
		this.entries.delete(path);
	}

	clear(): void {
		this.entries.clear();
	}

	allEntries(): IterableIterator<[string, EmbeddingCache]> {
		return this.entries.entries();
	}

	notePathForHash(hash: string): string | undefined {
		for (const [path] of this.entries) {
			if (hashPath(path) === hash) return path;
		}
		return undefined;
	}
}
