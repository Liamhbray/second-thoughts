import { App, TFile } from "obsidian";
import { LLMProvider } from "./llm";
import { EmbeddingIndex } from "./embedding";
import { SecondThoughtsSettings } from "./settings";
import { IdleDetector } from "./idle";

/** Core read/query capabilities every feature needs. */
export interface CoreServices {
	app: App;
	settings: SecondThoughtsSettings;
	index: EmbeddingIndex;
	llm: LLMProvider;
	isBootstrapComplete: () => boolean;
}

/** Circuit-breaker / back-off controls for API calls. */
export interface ResilienceServices {
	isApiPaused: () => boolean;
	recordApiSuccess: () => void;
	recordApiFailure: () => void;
	recordRateLimitHit: () => void;
	pauseApi: (ms: number) => void;
}

/** Idle-detection and note-level write helpers. */
export interface IdleServices {
	idle: IdleDetector;
	getActiveFilePath: () => string | null;
	addOwnWrite: (path: string) => void;
	embedNote: (file: TFile) => Promise<void>;
}

/** Full bus — constructed in main.ts, backwards-compatible with all consumers. */
export interface Services extends CoreServices, ResilienceServices, IdleServices {}
