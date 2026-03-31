import { App, Editor, EditorPosition, Modal } from "obsidian";
import {
	filterCandidatesSystem2,
	retrieveSimilar,
	generateIdeation,
} from "./retrieval";
import { EmbeddingIndex } from "./embedding";
import { SecondThoughtsSettings } from "./settings";

const ST_IDEA_START = "%%st-idea-start%%";
const ST_IDEA_END = "%%st-idea-end%%";

export { ST_IDEA_START, ST_IDEA_END };

export class IdeationModal extends Modal {
	private editor: Editor;
	private cursor: EditorPosition;
	private settings: SecondThoughtsSettings;
	private index: EmbeddingIndex;
	private filePath: string;

	constructor(
		app: App,
		editor: Editor,
		cursor: EditorPosition,
		settings: SecondThoughtsSettings,
		index: EmbeddingIndex,
		filePath: string
	) {
		super(app);
		this.editor = editor;
		this.cursor = cursor;
		this.settings = settings;
		this.index = index;
		this.filePath = filePath;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("st-ideation-modal");

		contentEl.createEl("h3", { text: "Second Thoughts" });

		const input = contentEl.createEl("textarea", {
			attr: {
				placeholder: "Ask a question about your notes...",
				rows: "4",
			},
		});
		input.style.cssText =
			"width: 100%; resize: vertical; padding: 8px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"border-radius: 4px; background: var(--background-primary); " +
			"color: var(--text-normal); font-size: 14px;";

		const btnRow = contentEl.createEl("div");
		btnRow.style.cssText =
			"display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;";

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		cancelBtn.addEventListener("click", () => this.close());

		const generateBtn = btnRow.createEl("button", { text: "Generate" });
		generateBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: none; " +
			"background: var(--interactive-accent); color: var(--text-on-accent);";
		generateBtn.addEventListener("click", () => {
			const prompt = input.value.trim();
			if (prompt) this.generate(prompt);
		});

		// Submit on Enter (Shift+Enter for newline)
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				const prompt = input.value.trim();
				if (prompt) this.generate(prompt);
			}
		});

		input.focus();
	}

	private async generate(userPrompt: string) {
		const { contentEl } = this;
		contentEl.empty();

		// Loading state
		contentEl.createEl("h3", { text: "Second Thoughts" });
		const loadingEl = contentEl.createEl("p", {
			text: "Thinking...",
		});
		loadingEl.style.cssText =
			"color: var(--text-muted); font-style: italic;";

		try {
			const noteContent = await this.app.vault.adapter.read(
				this.filePath
			);

			const candidates = filterCandidatesSystem2(
				this.app,
				this.filePath,
				this.settings,
				this.index
			);

			const shadow = this.index.get(this.filePath);
			if (!shadow) {
				this.showError("Note not yet indexed. Try again shortly.");
				return;
			}

			const results = retrieveSimilar(
				shadow,
				candidates,
				this.index,
				this.settings.topKPerCompartment
			);

			const response = await generateIdeation(
				noteContent,
				this.filePath,
				userPrompt,
				results,
				this.settings.apiKey,
				this.app
			);

			if (!response) {
				this.showError(
					"No relevant material found in your notes for this prompt."
				);
				return;
			}

			this.showResponse(response);
		} catch (e) {
			console.error("Second Thoughts: ideation failed", e);
			this.showError("Generation failed. Check the console for details.");
		}
	}

	private showResponse(response: string) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });

		const responseEl = contentEl.createEl("div", {
			cls: "st-ideation-response",
		});
		responseEl.style.cssText =
			"border-left: 3px solid var(--interactive-accent); " +
			"padding: 12px; margin: 12px 0; " +
			"background: var(--background-secondary); border-radius: 4px; " +
			"max-height: 300px; overflow-y: auto; white-space: pre-wrap;";
		responseEl.textContent = response;

		const btnRow = contentEl.createEl("div");
		btnRow.style.cssText =
			"display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;";

		const rejectBtn = btnRow.createEl("button", { text: "Reject" });
		rejectBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		rejectBtn.addEventListener("click", () => this.close());

		const acceptBtn = btnRow.createEl("button", { text: "Accept" });
		acceptBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: none; " +
			"background: var(--interactive-accent); color: var(--text-on-accent);";
		acceptBtn.addEventListener("click", () => {
			this.insert(response);
			this.close();
		});
	}

	private showError(message: string) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		const errEl = contentEl.createEl("p", { text: message });
		errEl.style.cssText = "color: var(--text-error);";

		const btnRow = contentEl.createEl("div");
		btnRow.style.cssText =
			"display: flex; justify-content: flex-end; margin-top: 12px;";
		const closeBtn = btnRow.createEl("button", { text: "Close" });
		closeBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		closeBtn.addEventListener("click", () => this.close());
	}

	private insert(text: string) {
		const wrapped = `\n${ST_IDEA_START}\n${text}\n${ST_IDEA_END}\n`;
		this.editor.replaceRange(wrapped, this.cursor);
	}

	onClose() {
		this.contentEl.empty();
	}
}
