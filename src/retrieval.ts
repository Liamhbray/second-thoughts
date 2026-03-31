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

export function filterCandidatesSystem2(
	app: App,
	sourcePath: string,
	settings: SecondThoughtsSettings,
	index: EmbeddingIndex
): Set<string> {
	const candidates = new Set<string>();

	if (settings.system2ScopeDefault === "folder") {
		// Folder scope: notes in same folder subtree
		const folder = sourcePath.substring(0, sourcePath.lastIndexOf("/") + 1);
		for (const [path] of index.allEntries()) {
			if (path !== sourcePath && path.startsWith(folder)) {
				candidates.add(path);
			}
		}
	} else {
		// Vault scope: all indexed notes
		for (const [path] of index.allEntries()) {
			if (path !== sourcePath) {
				candidates.add(path);
			}
		}
	}

	// Apply same exclusions
	for (const path of candidates) {
		for (const folder of settings.excludedFolders) {
			if (path.startsWith(folder + "/") || path.startsWith(folder)) {
				candidates.delete(path);
			}
		}
	}

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

// --- LLM generation (shared) ---

function formatResults(
	label: string,
	items: SimilarityResult[],
	app: App
): string {
	if (items.length === 0) return "";
	const lines = items.map((r) => {
		const file = app.vault.getAbstractFileByPath(r.path);
		const name = file instanceof TFile ? file.basename : r.path;
		return `  - [[${name}]] (score: ${r.score.toFixed(3)})`;
	});
	return `${label}:\n${lines.join("\n")}`;
}

function formatResultSections(results: RetrievalResults, app: App): string {
	return [
		formatResults("Matched on title similarity", results.title, app),
		formatResults("Matched on tag patterns", results.tags, app),
		formatResults("Matched on link overlap", results.links, app),
		formatResults("Matched on content similarity", results.content, app),
	]
		.filter((s) => s.length > 0)
		.join("\n\n");
}

async function callLLM(
	prompt: string,
	apiKey: string,
	maxTokens = 500
): Promise<string | null> {
	const response = await requestUrl({
		url: "https://api.openai.com/v1/chat/completions",
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "gpt-4o-mini",
			messages: [{ role: "user", content: prompt }],
			temperature: 0.7,
			max_tokens: maxTokens,
		}),
	});

	return response.json.choices?.[0]?.message?.content?.trim() || null;
}

// --- System 1: Footnotes ---

export interface FootnoteProposal {
	targetPath: string;
	targetName: string;
	reason: string;
}

function buildFootnotePrompt(
	noteContent: string,
	notePath: string,
	targetName: string,
	targetContent: string
): string {
	return `You are analysing connections between notes in a personal knowledge base.

Source note (${notePath}):
---
${noteContent}
---

Related note: "${targetName}"
---
${targetContent}
---

In ONE short sentence (under 30 words), explain why these notes are related. Be specific. No formatting or markdown — just the plain text reason.`;
}

export async function generateFootnoteReason(
	noteContent: string,
	notePath: string,
	targetPath: string,
	apiKey: string,
	app: App
): Promise<FootnoteProposal | null> {
	const targetFile = app.vault.getAbstractFileByPath(targetPath);
	if (!(targetFile instanceof TFile)) return null;

	const targetContent = await app.vault.read(targetFile);
	const targetName = targetFile.basename;

	const prompt = buildFootnotePrompt(noteContent, notePath, targetName, targetContent);
	const reason = await callLLM(prompt, apiKey, 80);
	if (!reason) return null;

	return { targetPath, targetName, reason: reason.replace(/\n/g, " ").trim() };
}

// --- System 1: Legacy callout (kept for migration) ---

function buildSystem1Prompt(
	noteContent: string,
	notePath: string,
	results: RetrievalResults,
	app: App
): string {
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

${formatResultSections(results, app)}`;
}

export async function generateSystem1Callout(
	noteContent: string,
	notePath: string,
	results: RetrievalResults,
	apiKey: string,
	app: App
): Promise<string | null> {
	const prompt = buildSystem1Prompt(noteContent, notePath, results, app);
	const text = await callLLM(prompt, apiKey);
	if (!text || !text.includes("[!connection]")) {
		return null;
	}
	return text;
}

// --- System 2 ---

function buildSystem2Prompt(
	noteContent: string,
	notePath: string,
	agentPrompt: string,
	results: RetrievalResults,
	app: App
): string {
	return `You are an assistant that explores a user's questions and ideas using only knowledge from their personal notes. You will be given:
1. The content of the current note
2. The user's specific question or prompt (tagged with @agent)
3. A set of related notes found by semantic similarity

Your task: synthesise a response that addresses the user's prompt using ONLY material from their notes.

Rules:
- Output ONLY the callout block, nothing else
- Use this exact format:

> [!ideation]
> Your synthesis with [[NoteNames]] woven naturally into the response — drawing connections across the user's own notes to address their question.

- All wikilinks must reference real notes from the results
- Synthesise across multiple notes where relevant
- Draw only from the user's own notes — no external knowledge
- Address the user's prompt directly
- If no relevant material exists, output nothing

User's prompt:
---
${agentPrompt}
---

Current note (${notePath}):
---
${noteContent}
---

Related notes found by similarity:

${formatResultSections(results, app)}`;
}

export async function generateSystem2Callout(
	noteContent: string,
	notePath: string,
	agentPrompt: string,
	results: RetrievalResults,
	apiKey: string,
	app: App
): Promise<string | null> {
	const prompt = buildSystem2Prompt(noteContent, notePath, agentPrompt, results, app);
	const text = await callLLM(prompt, apiKey);
	if (!text || !text.includes("[!ideation]")) {
		return null;
	}
	return text;
}

// --- @agent tag scanning ---

export function findAgentPromptEnd(
	content: string,
	agentTag: string
): number {
	const lines = content.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].includes(agentTag)) {
			let end = i;
			while (end < lines.length - 1 && lines[end + 1].trim().length > 0) {
				end++;
			}
			// Return character offset of end of this paragraph
			let offset = 0;
			for (let j = 0; j <= end; j++) {
				offset += lines[j].length + 1;
			}
			return offset - 1; // exclude trailing newline
		}
	}
	return -1;
}

export function findAgentPrompt(
	content: string,
	agentTag: string
): string | null {
	// Find the line containing the agent tag
	const lines = content.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].includes(agentTag)) {
			// The prompt is the text around the tag — take the paragraph
			const promptLines: string[] = [];
			// Scan backwards for paragraph start
			let start = i;
			while (start > 0 && lines[start - 1].trim().length > 0) {
				start--;
			}
			// Scan forwards for paragraph end
			let end = i;
			while (end < lines.length - 1 && lines[end + 1].trim().length > 0) {
				end++;
			}
			for (let j = start; j <= end; j++) {
				promptLines.push(lines[j]);
			}
			// Remove the tag itself from the prompt text
			return promptLines
				.join("\n")
				.replace(agentTag, "")
				.trim();
		}
	}
	return null;
}
