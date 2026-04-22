import { Notice, Plugin, TAbstractFile, TFile, MarkdownView } from "obsidian";
import { SecondThoughtsSettings } from "./settings";

export interface IdleHandler {
	(file: TFile): Promise<void>;
}

/**
 * Manages idle detection for notes.
 * When a note stops being edited and the user navigates away,
 * the registered handlers are called after a configurable debounce.
 */
export class IdleDetector {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private processing = new Set<string>();
	private ownWrites = new Set<string>();
	private activeFilePath: string | null = null;
	private handlers: IdleHandler[] = [];
	private missingKeyNoticeShown = false;

	constructor(
		private plugin: Plugin,
		private settings: SecondThoughtsSettings
	) {}

	/** Register a handler to be called when a note goes idle. */
	addHandler(handler: IdleHandler): void {
		this.handlers.push(handler);
	}

	/** Mark a file write as plugin-owned (skips idle timer reset). */
	addOwnWrite(path: string): void {
		this.ownWrites.add(path);
	}

	/** Get the currently active file path. */
	getActiveFilePath(): string | null {
		return this.activeFilePath;
	}

	/** Get all paths with active idle timers. */
	getIdleTimerPaths(): string[] {
		return [...this.timers.keys()];
	}

	/** Get all paths currently being processed. */
	getProcessingPaths(): string[] {
		return [...this.processing];
	}

	/** Register all vault/workspace events. */
	registerEvents(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === "md") {
					if (this.ownWrites.delete(file.path)) return;
					this.resetTimer(file);
				}
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", (file) => {
				this.activeFilePath = file?.path ?? null;
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf) {
					const view =
						this.plugin.app.workspace.getActiveViewOfType(
							MarkdownView
						);
					this.activeFilePath = view?.file?.path ?? null;
				}
			})
		);
	}

	/** Clear all timers and state. */
	destroy(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.processing.clear();
		this.ownWrites.clear();
	}

	private resetTimer(file: TFile): void {
		const existing = this.timers.get(file.path);
		if (existing) clearTimeout(existing);

		const debounceMs = this.settings.idleDebounceMinutes * 60 * 1000;
		const timer = setTimeout(() => {
			this.timers.delete(file.path);
			this.onIdle(file);
		}, debounceMs);

		this.timers.set(file.path, timer);
	}

	private async onIdle(file: TFile): Promise<void> {
		if (this.activeFilePath === file.path) return;
		if (!this.settings.apiKey) {
			if (!this.missingKeyNoticeShown) {
				this.missingKeyNoticeShown = true;
				new Notice(
					"Second Thoughts: Set your OpenAI API key in plugin settings to enable connections.",
					8000
				);
			}
			return;
		}
		if (this.processing.has(file.path)) return;

		this.processing.add(file.path);
		try {
			for (const handler of this.handlers) {
				await handler(file);
			}
		} finally {
			this.processing.delete(file.path);
		}
	}
}
