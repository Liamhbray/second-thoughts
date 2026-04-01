import { App, CachedMetadata, TFile } from "obsidian";
import { EmbeddingIndex, ShadowFile } from "./embedding";

// --- Types ---

export interface SimilarityResult {
	path: string;
	score: number;
}

export interface RetrievalResults {
	title: SimilarityResult[];
	tags: SimilarityResult[];
	links: SimilarityResult[];
	content: SimilarityResult[];
}

// --- Cosine similarity ---

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

// --- Scope pre-filters ---

export function scopeBFS(
	sourcePath: string,
	resolvedLinks: Record<string, Record<string, number>>,
	maxHops: number
): Set<string> {
	const visited = new Set<string>();
	let frontier = new Set<string>([sourcePath]);

	for (let hop = 0; hop < maxHops; hop++) {
		const nextFrontier = new Set<string>();
		for (const path of frontier) {
			const outgoing = resolvedLinks[path];
			if (outgoing) {
				for (const target of Object.keys(outgoing)) {
					if (!visited.has(target) && target !== sourcePath) {
						nextFrontier.add(target);
					}
				}
			}
			for (const [from, targets] of Object.entries(resolvedLinks)) {
				if (targets[path] && !visited.has(from) && from !== sourcePath) {
					nextFrontier.add(from);
				}
			}
		}
		for (const p of nextFrontier) {
			visited.add(p);
		}
		frontier = nextFrontier;
		if (frontier.size === 0) break;
	}

	return visited;
}

function hasExcludedTag(
	cache: CachedMetadata,
	excludedTags: string[]
): boolean {
	const noteTags: string[] = [];
	if (cache.tags) {
		for (const t of cache.tags) {
			noteTags.push(t.tag.toLowerCase());
		}
	}
	if (cache.frontmatter?.tags) {
		const fmTags = cache.frontmatter.tags;
		if (Array.isArray(fmTags)) {
			for (const t of fmTags) {
				noteTags.push(
					String(t).toLowerCase().startsWith("#")
						? String(t).toLowerCase()
						: "#" + String(t).toLowerCase()
				);
			}
		}
	}
	return excludedTags.some((excluded) =>
		noteTags.includes(excluded.toLowerCase())
	);
}

export function filterCandidates(
	app: App,
	sourcePath: string,
	hopDepth: number,
	excludedFolders: string[],
	excludedTags: string[],
	index: EmbeddingIndex
): Set<string> {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const candidates = scopeBFS(sourcePath, resolvedLinks, hopDepth);

	for (const path of candidates) {
		for (const folder of excludedFolders) {
			if (path.startsWith(folder + "/") || path.startsWith(folder)) {
				candidates.delete(path);
			}
		}
	}

	if (excludedTags.length > 0) {
		for (const path of candidates) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				const cache = app.metadataCache.getFileCache(file);
				if (cache && hasExcludedTag(cache, excludedTags)) {
					candidates.delete(path);
				}
			}
		}
	}

	for (const path of candidates) {
		if (!index.get(path)) {
			candidates.delete(path);
		}
	}

	return candidates;
}

export function searchCompartment(
	sourceVec: number[],
	candidates: Set<string>,
	index: EmbeddingIndex,
	compartment: keyof Pick<ShadowFile, "title" | "tags" | "links" | "content">,
	topK: number
): SimilarityResult[] {
	const results: SimilarityResult[] = [];

	for (const path of candidates) {
		const shadow = index.get(path);
		if (!shadow) continue;
		const vec = shadow[compartment] as number[];
		if (!vec || vec.length === 0) continue;
		const score = cosineSimilarity(sourceVec, vec);
		results.push({ path, score });
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, topK);
}

export function retrieveSimilar(
	sourceShadow: ShadowFile,
	candidates: Set<string>,
	index: EmbeddingIndex,
	topK: number
): RetrievalResults {
	return {
		title: searchCompartment(sourceShadow.title, candidates, index, "title", topK),
		tags: searchCompartment(sourceShadow.tags, candidates, index, "tags", topK),
		links: searchCompartment(sourceShadow.links, candidates, index, "links", topK),
		content: searchCompartment(sourceShadow.content, candidates, index, "content", topK),
	};
}

/**
 * Select K diverse results using Maximal Marginal Relevance.
 */
export function selectDiverseResults(
	queryVec: number[],
	candidates: Map<string, number[]>,
	k: number,
	lambda = 0.5
): string[] {
	const selected: string[] = [];
	const remaining = new Map(candidates);

	for (let i = 0; i < k && remaining.size > 0; i++) {
		let bestPath = "";
		let bestScore = -Infinity;

		for (const [path, vec] of remaining) {
			const relevance = cosineSimilarity(queryVec, vec);

			let maxRedundancy = 0;
			for (const selPath of selected) {
				const selVec = candidates.get(selPath)!;
				const sim = cosineSimilarity(vec, selVec);
				if (sim > maxRedundancy) maxRedundancy = sim;
			}

			const score = lambda * relevance - (1 - lambda) * maxRedundancy;
			if (score > bestScore) {
				bestScore = score;
				bestPath = path;
			}
		}

		if (bestPath) {
			selected.push(bestPath);
			remaining.delete(bestPath);
		}
	}

	return selected;
}
