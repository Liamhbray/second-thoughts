import { Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
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
	findAgentPrompt,
} from "./retrieval";

export default class SecondThoughtsPlugin extends Plugin {
	settings: SecondThoughtsSettings;
	private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private activeFilePath: string | null = null;
	private ownWrites: Set<string> = new Set();
	private index: EmbeddingIndex = new EmbeddingIndex();
	private processing: Set<string> = new Set();
	private bootstrapComplete = false;

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
		this.index.clear();
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

	private async onNoteIdle(file: TFile) {
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

		this.processing.add(file.path);
		try {
			await this.embedNote(file);

			// System 2: runs at any coverage level
			await this.runSystem2(file);

			// System 1: only after bootstrap complete
			if (this.bootstrapComplete) {
				await this.runSystem1(file);
			}
		} catch (e) {
			console.error(`Second Thoughts: processing failed for ${file.path}`, e);
		} finally {
			this.processing.delete(file.path);
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

		// Check if any results have already been proposed
		const allPaths = new Set([
			...results.title.map((r) => r.path),
			...results.tags.map((r) => r.path),
			...results.links.map((r) => r.path),
			...results.content.map((r) => r.path),
		]);

		// Skip if all top results have already been proposed
		const unproposed = [...allPaths].filter(
			(p) => !shadow.proposed.includes(p)
		);
		if (unproposed.length === 0) {
			console.log(`Second Thoughts: all candidates already proposed for ${file.path}`);
			return;
		}

		const noteContent = await this.app.vault.read(file);

		const callout = await generateSystem1Callout(
			noteContent,
			file.path,
			results,
			this.settings.apiKey,
			this.app
		);

		if (!callout) {
			console.log(`Second Thoughts: LLM returned no connection for ${file.path}`);
			return;
		}

		// Final idle re-check + atomic write
		if (this.activeFilePath === file.path) {
			return;
		}

		this.ownWrites.add(file.path);
		await this.app.vault.process(file, (data) => {
			// Final guard inside atomic callback
			if (this.activeFilePath === file.path) {
				return data;
			}
			return data + "\n\n" + callout + "\n";
		});

		// Track proposed targets in shadow file
		const proposedPaths = [...allPaths];
		shadow.proposed = [...new Set([...shadow.proposed, ...proposedPaths])];
		await saveShadowFile(this.app, file.path, shadow);

		console.log(`Second Thoughts: proposed connection for ${file.path}`);
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
			return data + "\n\n" + callout + "\n";
		});

		console.log(`Second Thoughts: proposed ideation for ${file.path}`);
	}

	private async bootstrap() {
		// Wait for metadataCache to finish resolving all files
		await new Promise<void>((resolve) => {
			const ref = this.app.metadataCache.on("resolved", () => {
				this.app.metadataCache.offref(ref);
				resolve();
			});
			// If already resolved, fire immediately
			if (this.app.metadataCache.resolved) {
				this.app.metadataCache.offref(ref);
				resolve();
			}
		});

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
				if (!this.settings.apiKey) break;
				try {
					await this.embedNote(file);
				} catch (e) {
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

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
