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
	findAgentPrompt,
} from "./retrieval";
import { EditorView } from "@codemirror/view";
import {
	calloutDecorationField,
	createCalloutEffectListener,
	findCallouts,
} from "./decorations";

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

		const effectListener = createCalloutEffectListener(
			(from, to) => this.handleAccept(from, to),
			(from, to) => this.handleReject(from, to)
		);

		this.registerEditorExtension([
			calloutDecorationField,
			EditorView.updateListener.of(effectListener),
		]);

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

	private async handleAccept(from: number, to: number): Promise<void> {
		const file = this.getActiveFile();
		if (!file) return;

		try {
			await this.app.vault.process(file, (data) => {
				const block = data.slice(from, to);
				// Strip callout markers: remove `> [!connection]`/`> [!ideation]` header
				// and `> ` prefix from continuation lines
				const lines = block.split("\n");
				const contentLines: string[] = [];
				for (let i = 0; i < lines.length; i++) {
					if (i === 0) {
						// Skip the header line `> [!type]`
						continue;
					}
					// Strip `> ` prefix
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
				// Delete the entire callout block and surrounding blank lines
				let start = from;
				let end = to;
				// Consume trailing newline
				while (end < data.length && data[end] === "\n") {
					end++;
				}
				// Consume leading blank line
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
