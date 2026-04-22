import { Notice, Plugin, TFile } from "obsidian";
import {
	SecondThoughtsSettings,
	DEFAULT_SETTINGS,
	SecondThoughtsSettingTab,
} from "./core/settings";
import {
	EmbeddingIndex,
	extractCompartments,
	embedCompartments,
	saveEmbeddingCache,
	EmbeddingCache,
} from "./core/embedding";
import { OpenAIProvider, LLMProvider, LLMError } from "./core/llm";
import { Services } from "./core/services";
import { IdleDetector } from "./core/idle";
import { runBootstrap } from "./core/bootstrap";
import {
	findCallouts,
	findCalloutAtLine,
	handleAccept,
	handleReject,
	handleRejectAll,
} from "./core/callouts";
import { activateFootnotes } from "./features/footnotes/activate";
import { activateIdeation } from "./features/ideation/activate";

export default class SecondThoughtsPlugin extends Plugin {
	settings!: SecondThoughtsSettings;
	private index = new EmbeddingIndex();
	private llm!: LLMProvider;
	private idle!: IdleDetector;
	private bootstrapComplete = false;
	private bootstrapInFlight = false;
	private consecutiveApiFailures = 0;
	private apiPausedUntil = 0;
	private lastBootstrapKey = "";
	private bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SecondThoughtsSettingTab(this.app, this));
		this.llm = new OpenAIProvider(() => this.settings.apiKey);

		// --- Idle detection ---
		this.idle = new IdleDetector(this, this.settings);
		this.idle.registerEvents();

		// Embedding is the first idle handler — runs before features
		this.idle.addHandler(async (file) => {
			try {
				await this.embedNote(file);
				this.recordApiSuccess();
			} catch (e) {
				if (e instanceof LLMError && e.kind === "auth") {
					this.pauseApi(10 * 60_000);
					new Notice(
						"Second Thoughts: API key rejected. Check plugin settings."
					);
					return;
				}
				if (e instanceof LLMError && e.kind === "rate_limit") {
					this.recordRateLimitHit();
				} else {
					this.recordApiFailure();
				}
				if (e instanceof LLMError && (e.kind === "rate_limit" || e.kind === "network")) {
					new Notice(`Second Thoughts: ${e.message}`);
				}
				console.error(
					`Second Thoughts: embed failed for ${file.path}`,
					e
				);
			}
		});

		// --- Build services ---
		const services: Services = {
			app: this.app,
			settings: this.settings,
			index: this.index,
			llm: this.llm,
			idle: this.idle,
			isBootstrapComplete: () => this.bootstrapComplete,
			getActiveFilePath: () => this.idle.getActiveFilePath(),
			isApiPaused: () => this.isApiPaused(),
			recordApiSuccess: () => this.recordApiSuccess(),
			recordApiFailure: () => this.recordApiFailure(),
			recordRateLimitHit: () => this.recordRateLimitHit(),
			pauseApi: (ms) => this.pauseApi(ms),
			addOwnWrite: (path) => this.idle.addOwnWrite(path),
			embedNote: (file) => this.embedNote(file),
		};

		// --- Activate features ---
		activateFootnotes(this, services);
		activateIdeation(this, services);

		// --- Legacy callout commands ---
		this.addCommand({
			id: "accept-callout",
			name: "Accept proposal at cursor",
			editorCheckCallback: (checking, editor, view) => {
				if (!view.file) return false;
				const callout = findCalloutAtLine(
					editor.getValue(),
					editor.getCursor().line
				);
				if (!callout) return false;
				if (checking) return true;
				handleAccept(this.app, callout.from, callout.to);
				return true;
			},
		});

		this.addCommand({
			id: "reject-callout",
			name: "Reject proposal at cursor",
			editorCheckCallback: (checking, editor, view) => {
				if (!view.file) return false;
				const callout = findCalloutAtLine(
					editor.getValue(),
					editor.getCursor().line
				);
				if (!callout) return false;
				if (checking) return true;
				handleReject(this.app, callout.from, callout.to);
				return true;
			},
		});

		this.addCommand({
			id: "reject-all-callouts",
			name: "Reject all proposals",
			editorCheckCallback: (checking, editor, view) => {
				if (!view.file) return false;
				if (findCallouts(editor.getValue()).length === 0) return false;
				if (checking) return true;
				handleRejectAll(this.app, view.file);
				return true;
			},
		});

		// --- Bootstrap ---
		this.app.workspace.onLayoutReady(() => {
			void this.runBootstrapOnce(this.settings.apiKey);
		});

		console.log("Second Thoughts: loaded");
	}

	onunload() {
		if (this.bootstrapRetryTimer) {
			clearTimeout(this.bootstrapRetryTimer);
			this.bootstrapRetryTimer = null;
		}
		this.idle.destroy();
		this.index.clear();
		this.consecutiveApiFailures = 0;
		this.apiPausedUntil = 0;
		console.log("Second Thoughts: unloaded");
	}

	/**
	 * Re-run bootstrap after the API key changes from empty/invalid to a
	 * new value, so indexing can catch up without a plugin reload.
	 * Debounced to avoid firing on every keystroke.
	 */
	onApiKeyChanged(): void {
		const key = this.settings.apiKey;
		if (!key || key === this.lastBootstrapKey) return;
		if (this.bootstrapRetryTimer) clearTimeout(this.bootstrapRetryTimer);
		this.bootstrapRetryTimer = setTimeout(() => {
			this.bootstrapRetryTimer = null;
			void this.runBootstrapOnce(this.settings.apiKey);
		}, 2000);
	}

	/**
	 * Run bootstrap guarded against concurrent invocations.
	 * lastBootstrapKey is only recorded on successful completion — a failed
	 * run leaves it unchanged so the user can retry the same key.
	 */
	private async runBootstrapOnce(key: string): Promise<void> {
		if (this.bootstrapInFlight) return;
		if (!key || key === this.lastBootstrapKey) return;
		this.bootstrapInFlight = true;
		this.consecutiveApiFailures = 0;
		this.apiPausedUntil = 0;
		try {
			await runBootstrap({
				app: this.app,
				index: this.index,
				apiKey: key,
				isApiPaused: () => this.isApiPaused(),
				embedNote: (file) => this.embedNote(file),
				recordApiSuccess: () => this.recordApiSuccess(),
				recordApiFailure: () => this.recordApiFailure(),
				recordRateLimitHit: () => this.recordRateLimitHit(),
				pauseApi: (ms) => this.pauseApi(ms),
			});
			this.lastBootstrapKey = key;
			this.bootstrapComplete = true;
		} catch (e) {
			console.error("Second Thoughts: bootstrap failed", e);
		} finally {
			this.bootstrapInFlight = false;
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
			const wasPaused = this.isApiPaused();
			this.apiPausedUntil = Date.now() + 60_000;
			if (!wasPaused) {
				new Notice(
					"Second Thoughts: pausing API calls for 60s after repeated failures."
				);
				console.warn(
					"Second Thoughts: API paused for 60s after 5 failures"
				);
			}
		}
	}

	private recordRateLimitHit(): void {
		this.consecutiveApiFailures++;
		const wasPaused = this.isApiPaused();
		this.apiPausedUntil = Date.now() + 30_000;
		if (!wasPaused) {
			new Notice("Second Thoughts: Rate limited by OpenAI. Pausing for 30s.");
		}
	}

	private pauseApi(ms: number): void {
		this.apiPausedUntil = Math.max(this.apiPausedUntil, Date.now() + ms);
	}

	// --- Embedding ---

	private async embedNote(file: TFile): Promise<void> {
		await this.waitForMetadataCache(file);

		const content = await this.app.vault.read(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const compartments = extractCompartments(file, content, cache);
		const vectors = await embedCompartments(compartments, this.llm);

		const cached: EmbeddingCache = {
			mtime: file.stat.mtime,
			title: vectors.title,
			tags: vectors.tags,
			links: vectors.links,
			content: vectors.content,
			proposed: this.index.get(file.path)?.proposed ?? [],
		};

		this.index.set(file.path, cached);
		await saveEmbeddingCache(this.app, file.path, cached);
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

	// --- Settings ---

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		if (this.settings.system1HopDepth && !data?.footnoteLinkDepth) {
			this.settings.footnoteLinkDepth = this.settings.system1HopDepth;
		}
		if (this.settings.topKPerCompartment && !data?.topK) {
			this.settings.topK = this.settings.topKPerCompartment;
		}

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
			processingPaths: this.idle.getProcessingPaths(),
			idleTimerPaths: this.idle.getIdleTimerPaths(),
			hasEntry: (path: string) => !!this.index.get(path),
			getProposed: (path: string) =>
				this.index.get(path)?.proposed ?? [],
		};
	}
}
