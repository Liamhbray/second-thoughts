import { App, Editor, Modal, TFile } from "obsidian";
import {
	embedText,
	selectDiverseResults,
	generateBridgingIdeas,
	cosineSimilarity,
} from "./retrieval";
import { EmbeddingIndex } from "./embedding";
import { SecondThoughtsSettings } from "./settings";

const ST_IDEA_START = "<!-- st-idea-start -->";
const ST_IDEA_END = "<!-- st-idea-end -->";

export { ST_IDEA_START, ST_IDEA_END };

export class IdeationModal extends Modal {
	private editor: Editor;
	private selectedText: string;
	private settings: SecondThoughtsSettings;
	private index: EmbeddingIndex;
	private filePath: string;

	constructor(
		app: App,
		editor: Editor,
		selection: string,
		settings: SecondThoughtsSettings,
		index: EmbeddingIndex,
		filePath: string
	) {
		super(app);
		this.editor = editor;
		this.selectedText = selection;
		this.settings = settings;
		this.index = index;
		this.filePath = filePath;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("st-ideation-modal");

		contentEl.createEl("h3", { text: "Second Thoughts" });

		if (this.selectedText) {
			contentEl.createEl("p", {
				text: "Selected context:",
			}).style.cssText =
				"font-size: 12px; color: var(--text-muted); margin-bottom: 4px;";

			const contextEl = document.createElement("div");
			contextEl.innerText = this.selectedText;
			contextEl.style.cssText =
				"border-left: 3px solid var(--interactive-accent); " +
				"padding: 8px 12px; margin-bottom: 12px; " +
				"background: var(--background-secondary); border-radius: 4px; " +
				"font-size: 13px; color: var(--text-muted); " +
				"max-height: 100px; overflow-y: auto; white-space: pre-wrap;";
			contentEl.appendChild(contextEl);
		}

		const input = contentEl.createEl("textarea", {
			attr: {
				placeholder: this.selectedText
					? "Add instructions (optional — press Enter to discover connections)..."
					: "Ask a question about your notes...",
				rows: "3",
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

		const submit = () => {
			const instruction = input.value.trim();
			if (this.selectedText || instruction) {
				this.generate(this.selectedText, instruction);
			}
		};

		generateBtn.addEventListener("click", submit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				submit();
			}
		});

		input.focus();
	}

	private async generate(selectionText: string, instruction: string) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		const loadingEl = contentEl.createEl("p", {
			text: "Finding connections across your vault...",
		});
		loadingEl.style.cssText =
			"color: var(--text-muted); font-style: italic;";

		try {
			// Get the text to embed — selection or full note content
			const textToEmbed = selectionText || await this.app.vault.adapter.read(this.filePath);

			// Embed the selection/note on the fly
			const queryVec = await embedText(
				textToEmbed.substring(0, 8000),
				this.settings.apiKey
			);

			// Build candidate map: path → content embedding (excluding current note)
			const candidateMap = new Map<string, number[]>();
			for (const [path, shadow] of this.index.allEntries()) {
				if (path === this.filePath) continue;
				if (shadow.content && shadow.content.length > 0) {
					candidateMap.set(path, shadow.content);
				}
			}

			if (candidateMap.size === 0) {
				this.showError("No indexed notes to search. Wait for bootstrap to complete.");
				return;
			}

			// Select diverse results via MMR
			const diversePaths = selectDiverseResults(
				queryVec,
				candidateMap,
				5,
				0.5
			);

			if (diversePaths.length === 0) {
				this.showError("No relevant notes found in your vault.");
				return;
			}

			loadingEl.textContent = "Generating ideas from " + diversePaths.length + " diverse notes...";

			// Generate bridging ideas
			const ideas = await generateBridgingIdeas(
				selectionText || textToEmbed.substring(0, 2000),
				instruction,
				diversePaths,
				this.settings.apiKey,
				this.settings.ideationModel,
				this.settings.ideasPerGeneration,
				this.app
			);

			if (!ideas || ideas.length === 0) {
				this.showError("No ideas generated. Try a different selection or prompt.");
				return;
			}

			this.showIdeas(ideas);
		} catch (e) {
			console.error("Second Thoughts: ideation failed", e);
			this.showError("Generation failed. Check the console for details.");
		}
	}

	private showIdeas(ideas: string[]) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		contentEl.createEl("p", {
			text: ideas.length + " ideas from across your vault:",
		}).style.cssText = "font-size: 12px; color: var(--text-muted); margin-bottom: 8px;";

		for (let i = 0; i < ideas.length; i++) {
			const idea = ideas[i];

			const ideaContainer = contentEl.createEl("div");
			ideaContainer.style.cssText =
				"border-left: 3px solid var(--interactive-accent); " +
				"padding: 10px 12px; margin-bottom: 12px; " +
				"background: var(--background-secondary); border-radius: 4px;";

			const ideaText = ideaContainer.createEl("div");
			ideaText.innerText = idea;
			ideaText.style.cssText =
				"font-size: 13px; line-height: 1.5; white-space: pre-wrap; margin-bottom: 8px;";

			const ideaBtns = ideaContainer.createEl("div");
			ideaBtns.style.cssText =
				"display: flex; gap: 6px; justify-content: flex-end;";

			const acceptBtn = ideaBtns.createEl("button", { text: "Accept" });
			acceptBtn.style.cssText =
				"font-size: 11px; padding: 2px 10px; cursor: pointer; border-radius: 3px; " +
				"border: none; " +
				"background: var(--interactive-accent); color: var(--text-on-accent);";

			const rejectBtn = ideaBtns.createEl("button", { text: "Dismiss" });
			rejectBtn.style.cssText =
				"font-size: 11px; padding: 2px 10px; cursor: pointer; border-radius: 3px; " +
				"border: 1px solid var(--background-modifier-border); " +
				"background: var(--background-secondary); color: var(--text-muted);";

			acceptBtn.addEventListener("click", () => {
				this.insertIdea(idea);
				ideaContainer.style.opacity = "0.4";
				acceptBtn.disabled = true;
				rejectBtn.disabled = true;
				acceptBtn.textContent = "Inserted";
			});

			rejectBtn.addEventListener("click", () => {
				ideaContainer.style.display = "none";
			});
		}

		const closeRow = contentEl.createEl("div");
		closeRow.style.cssText =
			"display: flex; justify-content: flex-end; margin-top: 8px;";
		const closeBtn = closeRow.createEl("button", { text: "Close" });
		closeBtn.style.cssText =
			"padding: 6px 16px; cursor: pointer; border-radius: 4px; " +
			"border: 1px solid var(--background-modifier-border); " +
			"background: var(--background-secondary); color: var(--text-normal);";
		closeBtn.addEventListener("click", () => this.close());
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

	private insertIdea(text: string) {
		const wrapped = "\n" + ST_IDEA_START + "\n" + text + "\n" + ST_IDEA_END + "\n";
		const cursor = this.editor.getCursor();
		this.editor.replaceRange(wrapped, cursor);
	}

	onClose() {
		this.contentEl.empty();
	}
}
