import { TFile, CachedMetadata, App } from "obsidian";
import { LLMProvider } from "./llm";

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

// --- Shadow file I/O ---

export function hashPath(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		const char = path.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash).toString(36);
}

export async function loadShadowFile(
	app: App,
	notePath: string
): Promise<ShadowFile | null> {
	const hash = hashPath(notePath);
	const shadowPath = `${EMBEDDINGS_DIR}/${hash}.json`;
	try {
		const raw = await app.vault.adapter.read(shadowPath);
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export async function saveShadowFile(
	app: App,
	notePath: string,
	shadow: ShadowFile
): Promise<void> {
	const hash = hashPath(notePath);
	const shadowPath = `${EMBEDDINGS_DIR}/${hash}.json`;
	await app.vault.adapter.write(shadowPath, JSON.stringify(shadow));
}

export async function deleteShadowFile(
	app: App,
	notePath: string
): Promise<void> {
	const hash = hashPath(notePath);
	const shadowPath = `${EMBEDDINGS_DIR}/${hash}.json`;
	try {
		await app.vault.adapter.remove(shadowPath);
	} catch {
		// File may not exist
	}
}

export async function loadAllShadowFiles(
	app: App
): Promise<Map<string, ShadowFile>> {
	const map = new Map<string, ShadowFile>();
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
	private entries = new Map<string, ShadowFile>();

	set(path: string, shadow: ShadowFile): void {
		this.entries.set(path, shadow);
	}

	get(path: string): ShadowFile | undefined {
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

	allEntries(): IterableIterator<[string, ShadowFile]> {
		return this.entries.entries();
	}

	notePathForHash(hash: string): string | undefined {
		for (const [path] of this.entries) {
			if (hashPath(path) === hash) return path;
		}
		return undefined;
	}
}
