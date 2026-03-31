import { requestUrl, TFile, CachedMetadata, App } from "obsidian";

export interface ShadowFile {
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
			// Strip internal links like [[#heading]] and [[#^block]]
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
		tags: tagSet.join(", ") || "(no tags)",
		links: linkSet.join(", ") || "(no links)",
		content,
	};
}

// --- OpenAI embedding API ---

export async function fetchEmbeddings(
	texts: string[],
	apiKey: string
): Promise<number[][]> {
	const response = await requestUrl({
		url: "https://api.openai.com/v1/embeddings",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "text-embedding-3-small",
			input: texts,
		}),
	});

	const data = response.json;
	// Response data[i] corresponds to texts[i], sorted by index
	const sorted = data.data.sort(
		(a: { index: number }, b: { index: number }) => a.index - b.index
	);
	return sorted.map((item: { embedding: number[] }) => item.embedding);
}

export async function embedCompartments(
	compartments: Compartments,
	apiKey: string
): Promise<{ title: number[]; tags: number[]; links: number[]; content: number[] }> {
	const texts = [
		compartments.title,
		compartments.tags,
		compartments.links,
		compartments.content,
	];
	const vectors = await fetchEmbeddings(texts, apiKey);
	return {
		title: vectors[0],
		tags: vectors[1],
		links: vectors[2],
		content: vectors[3],
	};
}

// --- Shadow file storage ---

function hashPath(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		const ch = path.charCodeAt(i);
		hash = ((hash << 5) - hash + ch) | 0;
	}
	return Math.abs(hash).toString(36);
}

function shadowFilePath(notePath: string): string {
	return `${EMBEDDINGS_DIR}/${hashPath(notePath)}.json`;
}

export async function loadShadowFile(
	app: App,
	notePath: string
): Promise<ShadowFile | null> {
	const path = shadowFilePath(notePath);
	try {
		const raw = await app.vault.adapter.read(path);
		return JSON.parse(raw) as ShadowFile;
	} catch {
		return null;
	}
}

export async function saveShadowFile(
	app: App,
	notePath: string,
	shadow: ShadowFile
): Promise<void> {
	const path = shadowFilePath(notePath);
	await app.vault.adapter.mkdir(EMBEDDINGS_DIR);
	await app.vault.adapter.write(path, JSON.stringify(shadow));
}

export async function deleteShadowFile(
	app: App,
	notePath: string
): Promise<void> {
	const path = shadowFilePath(notePath);
	try {
		await app.vault.adapter.remove(path);
	} catch {
		// Already gone
	}
}

export async function loadAllShadowFiles(
	app: App
): Promise<Map<string, ShadowFile>> {
	const map = new Map<string, ShadowFile>();
	try {
		const listing = await app.vault.adapter.list(EMBEDDINGS_DIR);
		for (const filePath of listing.files) {
			try {
				const raw = await app.vault.adapter.read(filePath);
				const shadow = JSON.parse(raw) as ShadowFile & { _notePath?: string };
				// We need a reverse lookup — store the embeddings dir filename
				// But shadow files are keyed by hash, so we'll build the map
				// during bootstrap by scanning vault files and checking mtime
				map.set(filePath, shadow);
			} catch {
				// Corrupt shadow file — skip, will be re-embedded
			}
		}
	} catch {
		// Directory doesn't exist yet
	}
	return map;
}

// --- Runtime index ---

export class EmbeddingIndex {
	// notePath → ShadowFile (embeddings + mtime + proposed)
	private entries: Map<string, ShadowFile> = new Map();
	// hash → notePath reverse lookup
	private hashToPath: Map<string, string> = new Map();

	get(notePath: string): ShadowFile | undefined {
		return this.entries.get(notePath);
	}

	set(notePath: string, shadow: ShadowFile): void {
		this.entries.set(notePath, shadow);
		this.hashToPath.set(hashPath(notePath), notePath);
	}

	delete(notePath: string): void {
		this.entries.delete(notePath);
		this.hashToPath.delete(hashPath(notePath));
	}

	notePathForHash(hash: string): string | undefined {
		return this.hashToPath.get(hash);
	}

	allEntries(): IterableIterator<[string, ShadowFile]> {
		return this.entries.entries();
	}

	size(): number {
		return this.entries.size;
	}

	clear(): void {
		this.entries.clear();
		this.hashToPath.clear();
	}
}
