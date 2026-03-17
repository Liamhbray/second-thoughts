import { App, TFile } from "obsidian";
import { LLMProvider } from "./llm";
import { EmbeddingIndex } from "./embedding";
import { SecondThoughtsSettings } from "./settings";
import { IdleDetector } from "./idle";

export interface Services {
	app: App;
	settings: SecondThoughtsSettings;
	index: EmbeddingIndex;
	llm: LLMProvider;
	idle: IdleDetector;
	isBootstrapComplete: () => boolean;
	getActiveFilePath: () => string | null;
	isApiPaused: () => boolean;
	recordApiSuccess: () => void;
	recordApiFailure: () => void;
	addOwnWrite: (path: string) => void;
	embedNote: (file: TFile) => Promise<void>;
}
