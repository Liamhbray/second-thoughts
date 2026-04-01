import {
	MarkdownView,
	Notice,
	Plugin,
	TAbstractFile,
	TFile,
} from "obsidian";
import {
	SecondThoughtsSettings,
	DEFAULT_SETTINGS,
	SecondThoughtsSettingTab,
} from "./core/settings";
import {
	EmbeddingIndex,
	extractCompartments,
	embedCompartments,
	saveShadowFile,
	loadAllShadowFiles,
	hashPath,
	ShadowFile,
} from "./core/embedding";
import { OpenAIProvider, LLMProvider } from "./core/llm";
import { Services } from "./core/services";
import { runFootnotes } from "./features/footnotes/pipeline";
import { activateIdeation } from "./features/ideation/activate";

export default class SecondThoughtsPlugin extends Plugin {
	settings!: SecondThoughtsSettings;
	private activeFilePath: string | null = null;
	private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private ownWrites = new Set<string>();
	private index = new EmbeddingIndex();
	private processing = new Set<string>();
	private bootstrapComplete = false;
	private consecutiveApiFailures = 0;
	private apiPausedUntil = 0;
	private llm!: LLMProvider;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SecondThoughtsSettingTab(this.app, this));
		this.llm = new OpenAIProvider(this.settings.apiKey);

		// --- Shared event handlers ---

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.ownWrites.delete(file.path)) return;
					this.resetIdleTimer(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				this.activeFilePath = file?.path ?? null;
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf) {
					const view =
						this.app.workspace.getActiveViewOfType(MarkdownView);
					this.activeFilePath = view?.file?.path ?? null;
				}
			})
		);

		// --- Build services bag ---

		const services: Services = {
			app: this.app,
			settings: this.settings,
			index: this.index,
			llm: this.llm,
			getActiveFilePath: () => this.activeFilePath,
			isApiPaused: () => this.isApiPaused(),
			recordApiSuccess: () => this.recordApiSuccess(),
			recordApiFailure: () => this.recordApiFailure(),
			addOwnWrite: (path) => this.ownWrites.add(path),
			embedNote: (file) => this.embedNote(file),
		};

		// --- Activate features ---

		activateIdeation(this, services);

		// --- Legacy callout commands (kept for existing callouts in vaults) ---

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

		// --- Bootstrap ---

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

	// --- Idle detection ---

	private resetIdleTimer(file: TFile) {
		const existing = this.idleTimers.get(file.path);
		if (existing) clearTimeout(existing);

		const debounceMs = this.settings.idleDebounceMinutes * 60 * 1000;
		const timer = setTimeout(() => {
			this.idleTimers.delete(file.path);
			this.onNoteIdle(file);
		}, debounceMs);

		this.idleTimers.set(file.path, timer);
	}

	private async onNoteIdle(file: TFile) {
		if (this.activeFilePath === file.path) return;
		if (!this.settings.apiKey) {
			new Notice(
				"Second Thoughts: API key required. Set it in plugin settings."
			);
			return;
		}
		if (this.processing.has(file.path)) return;
		if (this.isApiPaused()) return;

		try {
			this.processing.add(file.path);
			try {
				await this.embedNote(file);
				this.recordApiSuccess();

				if (this.bootstrapComplete && this.settings.enableFootnotes) {
					await runFootnotes(file, {
						app: this.app,
						settings: this.settings,
						index: this.index,
						llm: this.llm,
						getActiveFilePath: () => this.activeFilePath,
						isApiPaused: () => this.isApiPaused(),
						recordApiSuccess: () => this.recordApiSuccess(),
						recordApiFailure: () => this.recordApiFailure(),
						addOwnWrite: (path) => this.ownWrites.add(path),
						embedNote: (f) => this.embedNote(f),
					});
				}
			} catch (e) {
				this.recordApiFailure();
				console.error(
					`Second Thoughts: processing failed for ${file.path}`,
					e
				);
			}
		} finally {
			this.processing.delete(file.path);
		}
	}

	// --- API resilience ---

	private isApiPaused(): boolean {
		return Date.now() < this.apiPausedUntil;
	}

	private recordApiSuccess(): void {
		this.consecutiveApiFailures = 0;
	}

	private recordApiFailure(): void {
		this.consecutiveApiFailures++;
		if (this.consecutiveApiFailures >= 5) {
			this.apiPausedUntil = Date.now() + 60_000;
			console.warn("Second Thoughts: API paused for 60s after 5 failures");
		}
	}

	// --- Embedding ---

	private async embedNote(file: TFile): Promise<void> {
		await this.waitForMetadataCache(file);

		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const compartments = extractCompartments(file, content, cache);
		const vectors = await embedCompartments(compartments, this.llm);

		const shadow: ShadowFile = {
			mtime: file.stat.mtime,
			title: vectors.title,
			tags: vectors.tags,
			links: vectors.links,
			content: vectors.content,
			proposed: this.index.get(file.path)?.proposed ?? [],
		};

		this.index.set(file.path, shadow);
		await saveShadowFile(this.app, file.path, shadow);
		console.log(`Second Thoughts: embedded ${file.path}`);
	}

	private waitForMetadataCache(file: TFile): Promise<void> {
		return new Promise((resolve) => {
			const ref = this.app.metadataCache.on("changed", (changedFile) => {
				if (changedFile.path === file.path) {
					this.app.metadataCache.offref(ref);
					resolve();
				}
			});
			if (this.app.metadataCache.getFileCache(file)) {
				this.app.metadataCache.offref(ref);
				resolve();
			}
		});
	}

	// --- Bootstrap ---

	private async bootstrap() {
		try {
			await this.bootstrapInner();
		} catch (e) {
			console.error("Second Thoughts: bootstrap failed", e);
		}
	}

	private async bootstrapInner() {
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

		const shadowMap = await loadAllShadowFiles(this.app);
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

		staleQueue.sort((a, b) => b.stat.mtime - a.stat.mtime);

		console.log(
			`Second Thoughts: bootstrap — ${this.index.size()} cached, ${staleQueue.length} to embed`
		);

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
			if (i + BATCH_SIZE < staleQueue.length) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		this.bootstrapComplete = true;
		console.log(
			`Second Thoughts: bootstrap complete — ${this.index.size()} notes indexed`
		);
	}

	// --- Legacy callout helpers ---

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
				const lines = block.split("\n");
				const contentLines: string[] = [];
				for (let i = 0; i < lines.length; i++) {
					if (i === 0) continue;
					contentLines.push(lines[i].replace(/^>\s?/, ""));
				}
				const plainContent = contentLines.join("\n").trim();
				return (
					data.slice(0, from) + plainContent + data.slice(to)
				);
			});
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
				while (end < data.length && data[end] === "\n") end++;
				if (start > 0 && data[start - 1] === "\n") {
					start--;
					if (start > 0 && data[start - 1] === "\n") start--;
				}
				return data.slice(0, start) + data.slice(end);
			});
		} catch (e) {
			console.error("Second Thoughts: reject failed", e);
		}
	}

	private async handleRejectAll(file: TFile): Promise<void> {
		try {
			await this.app.vault.process(file, (data) => {
				const callouts = findCallouts(data);
				if (callouts.length === 0) return data;
				let result = data;
				for (let i = callouts.length - 1; i >= 0; i--) {
					const c = callouts[i];
					let start = c.from;
					let end = c.to;
					while (end < result.length && result[end] === "\n") end++;
					if (start > 0 && result[start - 1] === "\n") {
						start--;
						if (start > 0 && result[start - 1] === "\n") start--;
					}
					result = result.slice(0, start) + result.slice(end);
				}
				return result;
			});
		} catch (e) {
			console.error("Second Thoughts: reject-all failed", e);
		}
	}

	// --- Settings ---

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Migrate legacy field names
		if (this.settings.system1HopDepth && !data?.footnoteLinkDepth) {
			this.settings.footnoteLinkDepth = this.settings.system1HopDepth;
		}
		if (this.settings.topKPerCompartment && !data?.topK) {
			this.settings.topK = this.settings.topKPerCompartment;
		}

		// Validate settings
		if (
			typeof this.settings.idleDebounceMinutes !== "number" ||
			this.settings.idleDebounceMinutes <= 0
		) {
			this.settings.idleDebounceMinutes =
				DEFAULT_SETTINGS.idleDebounceMinutes;
		}
		if (
			typeof this.settings.footnoteLinkDepth !== "number" ||
			this.settings.footnoteLinkDepth < 1
		) {
			this.settings.footnoteLinkDepth = DEFAULT_SETTINGS.footnoteLinkDepth;
		}
		if (typeof this.settings.topK !== "number" || this.settings.topK < 1) {
			this.settings.topK = DEFAULT_SETTINGS.topK;
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

	// --- Debug (E2E testing) ---

	getDebugState() {
		return {
			indexSize: this.index.size(),
			bootstrapComplete: this.bootstrapComplete,
			processingPaths: [...this.processing],
			idleTimerPaths: [...this.idleTimers.keys()],
			hasEntry: (path: string) => !!this.index.get(path),
			getProposed: (path: string) =>
				this.index.get(path)?.proposed ?? [],
		};
	}
}

// --- Inline callout detection (used by legacy commands) ---

interface CalloutRange {
	type: "connection" | "ideation";
	from: number;
	to: number;
}

function findCallouts(text: string): CalloutRange[] {
	const callouts: CalloutRange[] = [];
	const lines = text.split("\n");
	let pos = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = line.match(/^>\s*\[!(connection|ideation)\]\s*$/);

		if (match) {
			const type = match[1] as "connection" | "ideation";
			const from = pos;
			let to = pos + line.length;

			let j = i + 1;
			while (j < lines.length && lines[j].startsWith("> ")) {
				to += 1 + lines[j].length;
				j++;
			}

			callouts.push({ type, from, to });
		}

		pos += line.length + 1;
	}

	return callouts;
}
