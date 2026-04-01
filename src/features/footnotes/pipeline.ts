import { Notice, TFile } from "obsidian";
import { Services } from "../../core/services";
import {
	filterCandidates,
	retrieveSimilar,
	cosineSimilarity,
} from "../../core/similarity";
import { saveShadowFile } from "../../core/embedding";
import { nextFootnoteId, formatFootnote } from "./format";
import { generateFootnoteReason } from "./prompts";

/**
 * Run the footnote pipeline for an idle note.
 * Generates footnotes for all candidates above the confidence threshold.
 */
export async function runFootnotes(
	file: TFile,
	services: Services
): Promise<void> {
	const { app, settings, index } = services;
	const shadow = index.get(file.path);
	if (!shadow) return;

	const candidates = filterCandidates(
		app,
		file.path,
		settings.footnoteLinkDepth,
		settings.excludedFolders,
		settings.excludedTags,
		index
	);

	if (candidates.size === 0) {
		console.log(`Second Thoughts: no candidates for ${file.path}`);
		return;
	}

	const results = retrieveSimilar(shadow, candidates, index, settings.topK);

	const allPaths = new Set([
		...results.title.map((r) => r.path),
		...results.tags.map((r) => r.path),
		...results.links.map((r) => r.path),
		...results.content.map((r) => r.path),
	]);

	const threshold = settings.footnoteThreshold;
	const targets = [...allPaths]
		.filter((p) => !shadow.proposed.includes(p))
		.map((p) => {
			const s = index.get(p);
			if (!s?.content?.length) return { path: p, score: 0 };
			return {
				path: p,
				score: cosineSimilarity(shadow.content, s.content),
			};
		})
		.filter((r) => r.score >= threshold)
		.sort((a, b) => b.score - a.score);

	if (targets.length === 0) {
		console.log(
			`Second Thoughts: no candidates above threshold (${threshold}) for ${file.path}`
		);
		return;
	}

	const noteContent = await app.vault.read(file);
	const proposedPaths: string[] = [];

	for (const target of targets) {
		if (services.getActiveFilePath() === file.path) break;
		if (services.isApiPaused()) break;

		const proposal = await generateFootnoteReason(
			noteContent,
			file.path,
			target.path,
			services.llm,
			app
		);

		if (!proposal) continue;
		services.recordApiSuccess();

		if (services.getActiveFilePath() === file.path) break;

		services.addOwnWrite(file.path);
		await app.vault.process(file, (data) => {
			if (services.getActiveFilePath() === file.path) return data;

			// Guard: skip if target already in a footnote definition
			const escaped = proposal.targetName.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&"
			);
			if (
				data.match(
					new RegExp(
						`^\\[\\^st-\\d+\\]:.*\\[\\[${escaped}\\]\\]`,
						"m"
					)
				)
			) {
				return data;
			}

			const id = nextFootnoteId(data);
			const { ref, def } = formatFootnote(
				id,
				proposal.targetName,
				proposal.reason
			);

			const lines = data.split("\n");
			const paragraphs: { endLine: number; text: string }[] = [];
			let paraStart = -1;

			for (let i = 0; i < lines.length; i++) {
				const blank = lines[i].trim() === "";
				const isHeading = lines[i].startsWith("#");
				const isTag = lines[i].match(/^#\w/);
				const isMeta =
					lines[i].startsWith("[^") || lines[i].startsWith("---");

				if (!blank && !isHeading && !isMeta && !isTag) {
					if (paraStart === -1) paraStart = i;
				} else if (paraStart !== -1) {
					paragraphs.push({
						endLine: i - 1,
						text: lines.slice(paraStart, i).join("\n"),
					});
					paraStart = -1;
				}
			}
			if (paraStart !== -1) {
				paragraphs.push({
					endLine: lines.length - 1,
					text: lines.slice(paraStart).join("\n"),
				});
			}

			// Pick paragraph by keyword match to target title
			let bestPara = paragraphs.length - 1;
			if (paragraphs.length > 1) {
				const titleWords = proposal.targetName
					.toLowerCase()
					.split(/\s+/);
				let bestScore = -1;
				for (let i = 0; i < paragraphs.length; i++) {
					const pText = paragraphs[i].text.toLowerCase();
					const score = titleWords.filter((w) =>
						pText.includes(w)
					).length;
					if (score > bestScore) {
						bestScore = score;
						bestPara = i;
					}
				}
			}

			if (paragraphs.length === 0) {
				const hasFootnotes = /^\[\^/.test(
					data.split("\n").slice(-5).join("\n")
				);
				const separator = hasFootnotes ? "" : "\n\n---";
				return data.trimEnd() + ref + separator + "\n\n" + def + "\n";
			}

			const insertLine = paragraphs[bestPara].endLine;
			lines[insertLine] = lines[insertLine] + ref;

			const joined = lines.join("\n").trimEnd();
			const hasFootnotes = /^\[\^/m.test(
				joined.split("\n").slice(-5).join("\n")
			);
			const separator = hasFootnotes ? "" : "\n\n---";
			return joined + separator + "\n\n" + def + "\n";
		});

		proposedPaths.push(target.path);
		new Notice(
			`Second Thoughts: ${file.basename} → [[${proposal.targetName}]]`
		);
		console.log(
			`Second Thoughts: proposed footnote for ${file.path} → ${target.path} (score: ${target.score.toFixed(3)})`
		);
	}

	if (proposedPaths.length > 0) {
		shadow.proposed = [
			...new Set([...shadow.proposed, ...proposedPaths]),
		];
		await saveShadowFile(app, file.path, shadow);
	}
}
