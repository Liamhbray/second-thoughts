import { Editor, MarkdownView, Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import {
	SecondThoughtsSettings,
	DEFAULT_SETTINGS,
	SecondThoughtsSettingTab,
} from "./settings";
import {
	EmbeddingIndex,
	extractCompartments,
	embedCompartments,
	saveShadowFile,
	loadAllShadowFiles,
	hashPath,
	ShadowFile,
} from "./embedding";
import {
	filterCandidates,
	filterCandidatesSystem2,
	retrieveSimilar,
	generateSystem1Callout,
	generateSystem2Callout,
	generateFootnoteReason,
	findAgentPrompt,
	findAgentPromptEnd,
	cosineSimilarity,
} from "./retrieval";
import { findCallouts, nextFootnoteId, formatFootnote } from "./decorations";

export default class SecondThoughtsPlugin extends Plugin {
	settings: SecondThoughtsSettings;
	private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private activeFilePath: string | null = null;
	private ownWrites: Set<string> = new Set();
	private index: EmbeddingIndex = new EmbeddingIndex();
	private processing: Set<string> = new Set();
	private bootstrapComplete = false;
	private consecutiveApiFailures = 0;
	private apiPausedUntil = 0;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SecondThoughtsSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.ownWrites.delete(file.path)) {
						return;
					}
					this.resetIdleTimer(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				this.activeFilePath = file?.path ?? null;
			})
		);

		this.registerEvent(
			this.app.workspace.on(
				"active-leaf-change",
				(leaf: WorkspaceLeaf | null) => {
					if (leaf) {
						const viewState = leaf.view?.getState();
						const file =
							viewState?.file
								? this.app.vault.getAbstractFileByPath(
										viewState.file
								  )
								: null;
						this.activeFilePath =
							file instanceof TFile ? file.path : null;
					} else {
						this.activeFilePath = null;
					}
				}
			)
		);

		// Ideation callout buttons (kept until ideas feature replaces them)
		this.registerMarkdownPostProcessor((el, ctx) => {
			const ideationEls = el.querySelectorAll<HTMLElement>(
				'.callout[data-callout="ideation"]'
			);
			for (const calloutEl of ideationEls) {
				const titleEl = calloutEl.querySelector(".callout-title");
				if (!titleEl) continue;

				const btnContainer = createEl("span", {
					cls: "second-thoughts-callout-buttons",
				});
				btnContainer.style.cssText =
					"display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: middle;";

				const acceptBtn = btnContainer.createEl("button", {
					text: "Accept",
					cls: "second-thoughts-accept-btn",
				});
				acceptBtn.style.cssText =
					"font-size: 11px; padding: 1px 8px; cursor: pointer; border-radius: 3px; " +
					"border: 1px solid var(--background-modifier-border); " +
					"background: var(--interactive-accent); color: var(--text-on-accent);";

				const rejectBtn = btnContainer.createEl("button", {
					text: "Reject",
					cls: "second-thoughts-reject-btn",
				});
				rejectBtn.style.cssText =
					"font-size: 11px; padding: 1px 8px; cursor: pointer; border-radius: 3px; " +
					"border: 1px solid var(--background-modifier-border); " +
					"background: var(--background-secondary); color: var(--text-normal);";

				const filePath = ctx.sourcePath;

				acceptBtn.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.handleCalloutByType("accept", "ideation", filePath);
				});

				rejectBtn.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.handleCalloutByType("reject", "ideation", filePath);
				});

				titleEl.appendChild(btnContainer);
			}
		});

		this.addCommand({
			id: "accept-callout",
			name: "Accept proposal at cursor",
			editorCheckCallback: (checking, editor, view) => {
				const file = view.file;
				if (!file) return false;
				const cursor = editor.getCursor();
				const content = editor.getValue();
				const callout = this.findCalloutAtLine(content, cursor.line);
				if (!callout) return false;
				if (checking) return true;
				this.handleAccept(callout.from, callout.to);
				return true;
			},
		});

		this.addCommand({
			id: "reject-callout",
			name: "Reject proposal at cursor",
			editorCheckCallback: (checking, editor, view) => {
				const file = view.file;
				if (!file) return false;
				const cursor = editor.getCursor();
				const content = editor.getValue();
				const callout = this.findCalloutAtLine(content, cursor.line);
				if (!callout) return false;
				if (checking) return true;
				this.handleReject(callout.from, callout.to);
				return true;
			},
		});

		this.addCommand({
			id: "reject-all-callouts",
			name: "Reject all proposals",
			editorCheckCallback: (checking, editor, view) => {
				const file = view.file;
				if (!file) return false;
				const content = editor.getValue();
				const callouts = findCallouts(content);
				if (callouts.length === 0) return false;
				if (checking) return true;
				this.handleRejectAll(file);
				return true;
			},
		});

		this.app.workspace.onLayoutReady(() => {
			this.bootstrap();
		});

		console.log("Second Thoughts: loaded");
	}

	onunload() {
		for (const timer of this.idleTimers.values()) {
			clearTimeout(timer);
		}
		this.idleTimers.clear();
		this.processing.clear();
		this.ownWrites.clear();
		this.index.clear();
		this.consecutiveApiFailures = 0;
		this.apiPausedUntil = 0;
		console.log("Second Thoughts: unloaded");
	}

	private resetIdleTimer(file: TFile) {
		const existing = this.idleTimers.get(file.path);
		if (existing) {
			clearTimeout(existing);
		}

		const debounceMs = this.settings.idleDebounceMinutes * 60 * 1000;
		const timer = setTimeout(() => {
			this.idleTimers.delete(file.path);
			this.onNoteIdle(file);
		}, debounceMs);

		this.idleTimers.set(file.path, timer);
	}

	private isApiPaused(): boolean {
		if (Date.now() < this.apiPausedUntil) {
			return true;
		}
		return false;
	}

	private recordApiSuccess(): void {
		this.consecutiveApiFailures = 0;
	}

	private recordApiFailure(): void {
		this.consecutiveApiFailures++;
		if (this.consecutiveApiFailures >= 5) {
			this.apiPausedUntil = Date.now() + 60_000;
			console.warn(
				`Second Thoughts: ${this.consecutiveApiFailures} consecutive API failures — pausing for 60s`
			);
		}
	}

	private async onNoteIdle(file: TFile) {
		try {
			if (this.activeFilePath === file.path) {
				return;
			}
			if (this.processing.has(file.path)) {
				return;
			}
			if (!this.settings.apiKey) {
				new Notice("Second Thoughts: API key required. Set it in plugin settings.");
				return;
			}
			if (this.isApiPaused()) {
				return;
			}

			this.processing.add(file.path);
			try {
				await this.embedNote(file);
				this.recordApiSuccess();

				// System 2: runs at any coverage level
				await this.runSystem2(file);

				// System 1: only after bootstrap complete
				if (this.bootstrapComplete) {
					await this.runSystem1(file);
				}
			} catch (e) {
				this.recordApiFailure();
				console.error(`Second Thoughts: processing failed for ${file.path}`, e);
			} finally {
				this.processing.delete(file.path);
			}
		} catch (e) {
			console.error(`Second Thoughts: unexpected error in onNoteIdle`, e);
		}
	}

	private waitForMetadataCache(file: TFile): Promise<void> {
		return new Promise((resolve) => {
			const ref = this.app.metadataCache.on("changed", (changedFile) => {
				if (changedFile.path === file.path) {
					this.app.metadataCache.offref(ref);
					resolve();
				}
			});
			// If cache is already fresh, resolve immediately
			if (this.app.metadataCache.getFileCache(file)) {
				this.app.metadataCache.offref(ref);
				resolve();
			}
		});
	}

	private async embedNote(file: TFile): Promise<void> {
		await this.waitForMetadataCache(file);

		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const compartments = extractCompartments(file, content, cache);
		const vectors = await embedCompartments(compartments, this.settings.apiKey);

		const shadow: ShadowFile = {
			mtime: file.stat.mtime,
			title: vectors.title,
			tags: vectors.tags,
			links: vectors.links,
			content: vectors.content,
			proposed: this.index.get(file.path)?.proposed ?? [],
		};

		await saveShadowFile(this.app, file.path, shadow);
		this.index.set(file.path, shadow);

		console.log(`Second Thoughts: embedded ${file.path}`);
	}

	private getActiveFile(): TFile | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.file ?? null;
	}

	private findCalloutAtLine(
		content: string,
		line: number
	): { from: number; to: number } | null {
		const callouts = findCallouts(content);
		const lines = content.split("\n");
		let pos = 0;
		for (let i = 0; i < line && i < lines.length; i++) {
			pos += lines[i].length + 1;
		}
		// Cursor position is within `pos` to `pos + lines[line].length`
		const cursorPos = pos;
		for (const c of callouts) {
			if (cursorPos >= c.from && cursorPos <= c.to) {
				return { from: c.from, to: c.to };
			}
		}
		return null;
	}

	private async handleCalloutByType(
		action: "accept" | "reject",
		calloutType: string,
		filePath: string
	): Promise<void> {
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) return;

		try {
			await this.app.vault.process(file, (data) => {
				const callouts = findCallouts(data);
				// Find the first callout matching the type
				const callout = callouts.find((c) => c.type === calloutType);
				if (!callout) return data;

				if (action === "accept") {
					const block = data.slice(callout.from, callout.to);
					const lines = block.split("\n");
					const contentLines: string[] = [];
					for (let i = 0; i < lines.length; i++) {
						if (i === 0) continue;
						contentLines.push(lines[i].replace(/^>\s?/, ""));
					}
					const plainContent = contentLines.join("\n").trim();
					let result =
						data.slice(0, callout.from) +
						plainContent +
						data.slice(callout.to);

					// For ideation: also strip the @agent prompt line
					if (calloutType === "ideation") {
						const tag = this.settings.agentTag;
						const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						result = result.replace(
							new RegExp("^[^\\n]*" + escaped + "[^\\n]*\\n?", "m"),
							""
						);
					}
					return result;
				} else {
					let start = callout.from;
					let end = callout.to;
					while (end < data.length && data[end] === "\n") {
						end++;
					}
					if (start > 0 && data[start - 1] === "\n") {
						start--;
						if (start > 0 && data[start - 1] === "\n") {
							start--;
						}
					}
					return data.slice(0, start) + data.slice(end);
				}
			});
			this.ownWrites.add(file.path);
			console.log(`Second Thoughts: ${action}ed callout in ${file.path}`);
		} catch (e) {
			console.error(`Second Thoughts: ${action} failed`, e);
		}
	}

	private async handleAccept(from: number, to: number): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		try {
			await this.app.vault.process(file, (data) => {
				const block = data.slice(from, to);
				const lines = block.split("\n");
				const contentLines: string[] = [];
				for (let i = 0; i < lines.length; i++) {
					if (i === 0) continue;
					contentLines.push(lines[i].replace(/^>\s?/, ""));
				}
				const plainContent = contentLines.join("\n").trim();
				return data.slice(0, from) + plainContent + data.slice(to);
			});
			console.log(`Second Thoughts: accepted callout in ${file.path}`);
		} catch (e) {
			console.error("Second Thoughts: accept failed", e);
		}
	}

	private async handleReject(from: number, to: number): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		try {
			await this.app.vault.process(file, (data) => {
				let start = from;
				let end = to;
				while (end < data.length && data[end] === "\n") {
					end++;
				}
				if (start > 0 && data[start - 1] === "\n") {
					start--;
					if (start > 0 && data[start - 1] === "\n") {
						start--;
					}
				}
				return data.slice(0, start) + data.slice(end);
			});
			console.log(`Second Thoughts: rejected callout in ${file.path}`);
		} catch (e) {
			console.error("Second Thoughts: reject failed", e);
		}
	}

	private async handleRejectAll(file: TFile): Promise<void> {
		try {
			await this.app.vault.process(file, (data) => {
				const callouts = findCallouts(data);
				if (callouts.length === 0) return data;

				// Process in reverse to preserve offsets
				let result = data;
				for (let i = callouts.length - 1; i >= 0; i--) {
					const c = callouts[i];
					let start = c.from;
					let end = c.to;
					while (end < result.length && result[end] === "\n") {
						end++;
					}
					if (start > 0 && result[start - 1] === "\n") {
						start--;
						if (start > 0 && result[start - 1] === "\n") {
							start--;
						}
					}
					result = result.slice(0, start) + result.slice(end);
				}
				return result;
			});
			console.log(`Second Thoughts: rejected all callouts in ${file.path}`);
		} catch (e) {
			console.error("Second Thoughts: reject-all failed", e);
		}
	}

	private async runSystem1(file: TFile): Promise<void> {
		const shadow = this.index.get(file.path);
		if (!shadow) return;

		const candidates = filterCandidates(
			this.app,
			file.path,
			this.settings,
			this.index
		);

		if (candidates.size === 0) {
			console.log(`Second Thoughts: no candidates for ${file.path}`);
			return;
		}

		const results = retrieveSimilar(
			shadow,
			candidates,
			this.index,
			this.settings.topKPerCompartment
		);

		// Collect all candidate paths and find the best unproposed one
		const allPaths = new Set([
			...results.title.map((r) => r.path),
			...results.tags.map((r) => r.path),
			...results.links.map((r) => r.path),
			...results.content.map((r) => r.path),
		]);

		const unproposed = [...allPaths].filter(
			(p) => !shadow.proposed.includes(p)
		);
		if (unproposed.length === 0) {
			console.log(
				`Second Thoughts: all candidates already proposed for ${file.path}`
			);
			return;
		}

		// Pick the top unproposed candidate by content similarity
		const ranked = unproposed
			.map((p) => {
				const s = this.index.get(p);
				if (!s?.content?.length) return { path: p, score: 0 };
				return {
					path: p,
					score: cosineSimilarity(shadow.content, s.content),
				};
			})
			.sort((a, b) => b.score - a.score);

		const bestTarget = ranked[0].path;

		const noteContent = await this.app.vault.read(file);

		// Generate a plain-text reason via LLM
		const proposal = await generateFootnoteReason(
			noteContent,
			file.path,
			bestTarget,
			this.settings.apiKey,
			this.app
		);

		if (!proposal) {
			console.log(
				`Second Thoughts: LLM returned no footnote for ${file.path}`
			);
			return;
		}

		// Final idle re-check
		if (this.activeFilePath === file.path) {
			return;
		}

		// Find the best paragraph to attach the footnote to
		const targetShadow = this.index.get(bestTarget);

		this.ownWrites.add(file.path);
		await this.app.vault.process(file, (data) => {
			if (this.activeFilePath === file.path) {
				return data;
			}

			const id = nextFootnoteId(data);
			const { ref, def } = formatFootnote(
				id,
				proposal.targetName,
				proposal.reason
			);

			// Find the best paragraph to place the reference
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

			// Pick the paragraph most similar to the target note's content
			let bestPara = paragraphs.length - 1;
			if (targetShadow?.content?.length && paragraphs.length > 1) {
				// Simple heuristic: pick the paragraph that shares the most
				// keywords with the target note's title
				const targetTitle = proposal.targetName.toLowerCase();
				let bestScore = -1;
				for (let i = 0; i < paragraphs.length; i++) {
					const pText = paragraphs[i].text.toLowerCase();
					// Score: count target title words found in paragraph
					const words = targetTitle.split(/\s+/);
					const score = words.filter((w) =>
						pText.includes(w)
					).length;
					if (score > bestScore) {
						bestScore = score;
						bestPara = i;
					}
				}
			}

			if (paragraphs.length === 0) {
				// No paragraphs found — append at end
				const hasFootnotes = /^\[\^/.test(data.split("\n").slice(-5).join("\n"));
				const separator = hasFootnotes ? "" : "\n\n---";
				return data.trimEnd() + ref + separator + "\n\n" + def + "\n";
			}

			// Insert reference at end of best paragraph's last line
			const insertLine = paragraphs[bestPara].endLine;
			lines[insertLine] = lines[insertLine] + ref;

			// Append definition at bottom — add --- separator if first footnote
			const joined = lines.join("\n").trimEnd();
			const hasFootnotes = /^\[\^/m.test(joined.split("\n").slice(-5).join("\n"));
			const separator = hasFootnotes ? "" : "\n\n---";
			return joined + separator + "\n\n" + def + "\n";
		});

		// Track proposed target
		shadow.proposed = [...new Set([...shadow.proposed, bestTarget])];
		await saveShadowFile(this.app, file.path, shadow);

		new Notice(`Second Thoughts: linked to [[${proposal.targetName}]]`);
		console.log(`Second Thoughts: proposed footnote for ${file.path}`);
	}

	private async runSystem2(file: TFile): Promise<void> {
		const noteContent = await this.app.vault.read(file);
		const agentPrompt = findAgentPrompt(noteContent, this.settings.agentTag);

		if (!agentPrompt) {
			return;
		}

		const shadow = this.index.get(file.path);
		if (!shadow) return;

		const candidates = filterCandidatesSystem2(
			this.app,
			file.path,
			this.settings,
			this.index
		);

		const results = retrieveSimilar(
			shadow,
			candidates,
			this.index,
			this.settings.topKPerCompartment
		);

		const callout = await generateSystem2Callout(
			noteContent,
			file.path,
			agentPrompt,
			results,
			this.settings.apiKey,
			this.app
		);

		if (!callout) {
			console.log(`Second Thoughts: LLM returned no ideation for ${file.path}`);
			return;
		}

		// Final idle re-check + atomic write
		if (this.activeFilePath === file.path) {
			return;
		}

		this.ownWrites.add(file.path);
		await this.app.vault.process(file, (data) => {
			if (this.activeFilePath === file.path) {
				return data;
			}
			// Insert after the @agent paragraph
			const endOffset = findAgentPromptEnd(
				data,
				this.settings.agentTag
			);
			if (endOffset === -1) {
				return data + "\n\n" + callout + "\n";
			}
			return (
				data.slice(0, endOffset + 1) +
				"\n\n" +
				callout +
				"\n" +
				data.slice(endOffset + 1)
			);
		});

		console.log(`Second Thoughts: proposed ideation for ${file.path}`);
	}

	private async bootstrap() {
		try {
		await this.bootstrapInner();
		} catch (e) {
			console.error("Second Thoughts: bootstrap failed", e);
		}
	}

	private async bootstrapInner() {
		// Wait for metadataCache to finish resolving all files
		const alreadyResolved =
			Object.keys(this.app.metadataCache.resolvedLinks).length > 0;
		if (!alreadyResolved) {
			await new Promise<void>((resolve) => {
				const ref = this.app.metadataCache.on("resolved", () => {
					this.app.metadataCache.offref(ref);
					resolve();
				});
			});
		}

		// Load existing shadow files into a temporary map keyed by FS path
		const shadowMap = await loadAllShadowFiles(this.app);

		// Scan vault and match shadow files by hash
		const allNotes = this.app.vault.getMarkdownFiles();
		const staleQueue: TFile[] = [];

		for (const note of allNotes) {
			const hash = hashPath(note.path);
			const shadowKey = [...shadowMap.keys()].find((k) =>
				k.endsWith(`/${hash}.json`)
			);

			if (shadowKey) {
				const shadow = shadowMap.get(shadowKey)!;
				this.index.set(note.path, shadow);
				if (shadow.mtime !== note.stat.mtime) {
					staleQueue.push(note);
				}
				shadowMap.delete(shadowKey);
			} else {
				staleQueue.push(note);
			}
		}

		// Sort: recently modified first
		staleQueue.sort((a, b) => b.stat.mtime - a.stat.mtime);

		console.log(
			`Second Thoughts: bootstrap — ${this.index.size()} cached, ${staleQueue.length} to embed`
		);

		// Process in batches of 50 with yields
		const BATCH_SIZE = 50;
		for (let i = 0; i < staleQueue.length; i += BATCH_SIZE) {
			const batch = staleQueue.slice(i, i + BATCH_SIZE);
			for (const file of batch) {
				if (!this.settings.apiKey || this.isApiPaused()) break;
				try {
					await this.embedNote(file);
					this.recordApiSuccess();
				} catch (e) {
					this.recordApiFailure();
					console.error(
						`Second Thoughts: bootstrap embed failed for ${file.path}`,
						e
					);
				}
			}
			// Yield to main thread between batches
			if (i + BATCH_SIZE < staleQueue.length) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		this.bootstrapComplete = true;
		console.log(
			`Second Thoughts: bootstrap complete — ${this.index.size()} notes indexed`
		);
	}

	getDebugState() {
		return {
			indexSize: this.index.size(),
			bootstrapComplete: this.bootstrapComplete,
			processingPaths: [...this.processing],
			idleTimerPaths: [...this.idleTimers.keys()],
			hasEntry: (path: string) => !!this.index.get(path),
			getProposed: (path: string) => this.index.get(path)?.proposed ?? [],
		};
	}

	async loadSettings() {
		let data: any = {};
		try {
			data = (await this.loadData()) ?? {};
		} catch (e) {
			console.error("Second Thoughts: failed to load settings, using defaults", e);
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Validate numeric settings
		if (typeof this.settings.idleDebounceMinutes !== "number" || this.settings.idleDebounceMinutes <= 0) {
			this.settings.idleDebounceMinutes = DEFAULT_SETTINGS.idleDebounceMinutes;
		}
		if (typeof this.settings.system1HopDepth !== "number" || this.settings.system1HopDepth < 1) {
			this.settings.system1HopDepth = DEFAULT_SETTINGS.system1HopDepth;
		}
		if (typeof this.settings.topKPerCompartment !== "number" || this.settings.topKPerCompartment < 1) {
			this.settings.topKPerCompartment = DEFAULT_SETTINGS.topKPerCompartment;
		}
		if (!Array.isArray(this.settings.excludedFolders)) {
			this.settings.excludedFolders = DEFAULT_SETTINGS.excludedFolders;
		}
		if (!Array.isArray(this.settings.excludedTags)) {
			this.settings.excludedTags = DEFAULT_SETTINGS.excludedTags;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
