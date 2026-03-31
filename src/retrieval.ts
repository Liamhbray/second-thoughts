import { App, CachedMetadata, TFile, requestUrl } from "obsidian";
import { EmbeddingIndex, ShadowFile } from "./embedding";
import { SecondThoughtsSettings } from "./settings";

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
			// Also check incoming links
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

export function filterCandidates(
	app: App,
	sourcePath: string,
	settings: SecondThoughtsSettings,
	index: EmbeddingIndex
): Set<string> {
	const resolvedLinks = app.metadataCache.resolvedLinks;
	const candidates = scopeBFS(
		sourcePath,
		resolvedLinks,
		settings.system1HopDepth
	);

	// Filter out excluded folders
	for (const path of candidates) {
		for (const folder of settings.excludedFolders) {
			if (path.startsWith(folder + "/") || path.startsWith(folder)) {
				candidates.delete(path);
			}
		}
	}

	// Filter out excluded tags
	if (settings.excludedTags.length > 0) {
		for (const path of candidates) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				const cache = app.metadataCache.getFileCache(file);
				if (cache && hasExcludedTag(cache, settings.excludedTags)) {
					candidates.delete(path);
				}
			}
		}
	}

	// Only keep candidates that are in the index
	for (const path of candidates) {
		if (!index.get(path)) {
			candidates.delete(path);
		}
	}

	return candidates;
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

// --- LLM generation ---

function buildSystem1Prompt(
	noteContent: string,
	notePath: string,
	results: RetrievalResults,
	app: App
): string {
	const formatResults = (
		label: string,
		items: SimilarityResult[]
	): string => {
		if (items.length === 0) return "";
		const lines = items.map((r) => {
			const file = app.vault.getAbstractFileByPath(r.path);
			const name = file instanceof TFile ? file.basename : r.path;
			return `  - [[${name}]] (score: ${r.score.toFixed(3)})`;
		});
		return `${label}:\n${lines.join("\n")}`;
	};

	const resultSections = [
		formatResults("Matched on title similarity", results.title),
		formatResults("Matched on tag patterns", results.tags),
		formatResults("Matched on link overlap", results.links),
		formatResults("Matched on content similarity", results.content),
	]
		.filter((s) => s.length > 0)
		.join("\n\n");

	return `You are an assistant that discovers connections between notes in a personal knowledge base. You will be given:
1. The content of the current note
2. A set of related notes found by semantic similarity, grouped by what matched (title, tags, links, content)

Your task: propose ONE meaningful connection between the current note and one of the related notes.

Rules:
- Output ONLY the callout block, nothing else
- Use this exact format:

> [!connection]
> Your sentence with [[NoteName]] woven naturally into it — explaining WHY the connection matters in the context of what the user wrote.

- The wikilink must reference a real note from the results
- Do NOT output a bare link list — write a contextual sentence with the link embedded
- Explain what the two notes share, how they relate, and why it matters
- Draw only from the user's own notes — no external knowledge
- If no meaningful connection exists, output nothing

Current note (${notePath}):
---
${noteContent}
---

Related notes found by similarity:

${resultSections}`;
}

export async function generateSystem1Callout(
	noteContent: string,
	notePath: string,
	results: RetrievalResults,
	apiKey: string,
	app: App
): Promise<string | null> {
	const prompt = buildSystem1Prompt(noteContent, notePath, results, app);

	const response = await requestUrl({
		url: "https://api.openai.com/v1/chat/completions",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
			temperature: 0.7,
			max_tokens: 500,
		}),
	});

	const text = response.json.choices?.[0]?.message?.content?.trim();
	if (!text || !text.includes("[!connection]")) {
		return null;
	}
	return text;
}
