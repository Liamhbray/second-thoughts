import { App, TFile } from "obsidian";
import { LLMProvider } from "./llm";
import { EmbeddingIndex } from "./embedding";
import { SecondThoughtsSettings } from "./settings";

export interface Services {
	app: App;
	settings: SecondThoughtsSettings;
	index: EmbeddingIndex;
	llm: LLMProvider;
	getActiveFilePath: () => string | null;
	isApiPaused: () => boolean;
	recordApiSuccess: () => void;
	recordApiFailure: () => void;
	addOwnWrite: (path: string) => void;
	embedNote: (file: TFile) => Promise<void>;
}
