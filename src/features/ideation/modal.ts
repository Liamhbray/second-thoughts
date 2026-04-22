import { App, Editor, EditorPosition, Modal, TFile } from "obsidian";
import { EmbeddingIndex } from "../../core/embedding";
import { LLMError, LLMProvider } from "../../core/llm";
import { selectDiverseResults } from "../../core/similarity";
import { SecondThoughtsSettings } from "../../core/settings";
import { generateBridgingIdeas } from "./prompts";

export class IdeationModal extends Modal {
	private editor: Editor;
	private selectedText: string;
	private insertPos: EditorPosition;
	private settings: SecondThoughtsSettings;
	private index: EmbeddingIndex;
	private llm: LLMProvider;
	private filePath: string;
	private isApiPaused: () => boolean;

	constructor(
		app: App,
		editor: Editor,
		selection: string,
		settings: SecondThoughtsSettings,
		index: EmbeddingIndex,
		llm: LLMProvider,
		filePath: string,
		isApiPaused: () => boolean
	) {
		super(app);
		this.editor = editor;
		this.selectedText = selection;
		// Capture insert position: end of selection (or cursor if no selection)
		// Move to the end of the line to append after the paragraph
		const selEnd = editor.getCursor("to");
		const lineLen = editor.getLine(selEnd.line).length;
		this.insertPos = { line: selEnd.line, ch: lineLen };
		this.settings = settings;
		this.index = index;
		this.llm = llm;
		this.filePath = filePath;
		this.isApiPaused = isApiPaused;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("st-ideation-modal");

		contentEl.createEl("h3", { text: "Second Thoughts" });

		if (this.selectedText) {
			contentEl.createEl("p", {
				text: "Selected context:",
				cls: "st-context-label",
			});

			const contextEl = contentEl.createEl("div", {
				cls: "st-context-box",
			});
			contextEl.innerText = this.selectedText;
		}

		const input = contentEl.createEl("textarea", {
			cls: "st-input",
			attr: {
				placeholder: this.selectedText
					? "Add instructions (optional — press Enter to discover connections)..."
					: "Ask a question about your notes...",
				rows: "3",
			},
		});

		const btnRow = contentEl.createEl("div", { cls: "st-btn-row" });

		const cancelBtn = btnRow.createEl("button", {
			text: "Cancel",
			cls: "st-btn-secondary",
		});
		cancelBtn.addEventListener("click", () => this.close());

		const generateBtn = btnRow.createEl("button", {
			text: "Ideate",
			cls: "st-btn-primary",
		});

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
		if (this.isApiPaused()) {
			this.showError(
				"API calls are paused due to recent errors. Try again in a moment."
			);
			return;
		}

		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		const loadingEl = contentEl.createEl("p", {
			text: "Finding connections across your vault...",
			cls: "st-loading",
		});

		try {
			const noteFile = this.app.vault.getFileByPath(this.filePath);
			const textToEmbed =
				selectionText ||
				(noteFile ? await this.app.vault.read(noteFile) : "");

			const queryVec = await this.llm.embed(
				textToEmbed.substring(0, 8000)
			);

			const candidateMap = new Map<string, number[]>();
			for (const [path, cached] of this.index.allEntries()) {
				if (path === this.filePath) continue;
				if (cached.content && cached.content.length > 0) {
					candidateMap.set(path, cached.content);
				}
			}

			if (candidateMap.size === 0) {
				this.showError(
					"No indexed notes to search. Wait for bootstrap to complete."
				);
				return;
			}

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

			loadingEl.textContent =
				"Generating ideas from " +
				diversePaths.length +
				" diverse notes...";

			const ideas = await generateBridgingIdeas(
				selectionText || textToEmbed.substring(0, 2000),
				instruction,
				diversePaths,
				this.llm,
				this.settings.ideationModel,
				this.settings.ideasPerGeneration,
				this.app
			);

			if (!ideas || ideas.length === 0) {
				this.showError(
					"No ideas generated. Try a different selection or prompt."
				);
				return;
			}

			this.showIdeas(ideas);
		} catch (e) {
			console.error("Second Thoughts: ideation failed", e);
			this.showError(describeError(e));
		}
	}

	private showIdeas(ideas: string[]) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		contentEl.createEl("p", {
			text: ideas.length + " ideas from across your vault:",
			cls: "st-ideas-count",
		});

		for (const idea of ideas) {
			const card = contentEl.createEl("div", { cls: "st-idea-card" });

			const text = card.createEl("div", { cls: "st-idea-text" });
			text.innerText = idea;

			const btns = card.createEl("div", { cls: "st-idea-btns" });

			const acceptBtn = btns.createEl("button", {
				text: "Accept",
				cls: "st-btn-accept",
			});

			const dismissBtn = btns.createEl("button", {
				text: "Dismiss",
				cls: "st-btn-dismiss",
			});

			acceptBtn.addEventListener("click", () => {
				this.insertIdea(idea);
				card.style.opacity = "0.4";
				acceptBtn.disabled = true;
				dismissBtn.disabled = true;
				acceptBtn.textContent = "Inserted";
			});

			dismissBtn.addEventListener("click", () => {
				card.style.display = "none";
			});
		}

		const closeRow = contentEl.createEl("div", { cls: "st-btn-row" });
		const closeBtn = closeRow.createEl("button", {
			text: "Close",
			cls: "st-btn-secondary",
		});
		closeBtn.addEventListener("click", () => this.close());
	}

	private showError(message: string) {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", { text: "Second Thoughts" });
		contentEl.createEl("p", { text: message, cls: "st-error" });

		const btnRow = contentEl.createEl("div", { cls: "st-btn-row" });
		const closeBtn = btnRow.createEl("button", {
			text: "Close",
			cls: "st-btn-secondary",
		});
		closeBtn.addEventListener("click", () => this.close());
	}

	private insertIdea(text: string) {
		const lines = text.split("\n");
		const body = lines.map((l) => "> " + l).join("\n");
		const callout =
			"\n\n> [!idea] Second Thoughts : Idea\n" + body + "\n";
		this.editor.replaceRange(callout, this.insertPos);
		// Advance insert position so multiple accepts stack below each other
		const insertedLines = callout.split("\n").length;
		this.insertPos = {
			line: this.insertPos.line + insertedLines - 1,
			ch: 0,
		};
	}

	onClose() {
		this.contentEl.empty();
	}
}

function describeError(e: unknown): string {
	if (e instanceof LLMError) {
		switch (e.kind) {
			case "auth":
				return "API key rejected by OpenAI. Check your key in plugin settings.";
			case "rate_limit":
				return "OpenAI rate limit hit. Try again in a moment.";
			case "network":
				return "Could not reach OpenAI. Check your connection.";
			case "server":
				return "OpenAI server error. Try again later.";
		}
	}
	return "Generation failed. Check the console for details.";
}
