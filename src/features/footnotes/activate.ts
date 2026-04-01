import { Plugin } from "obsidian";
import { Services } from "../../core/services";

/**
 * Activate the footnotes feature.
 * Currently a no-op — the idle trigger and footnote pipeline are wired
 * in main.ts because they share the idle detection infrastructure.
 * This module serves as the feature's entry point for future isolation.
 */
export function activateFootnotes(
	_plugin: Plugin,
	_services: Services
): void {
	// Footnote pipeline is triggered from onNoteIdle in main.ts
	// via runFootnotes(). Command registration is not needed —
	// footnotes are fully automatic.
}
