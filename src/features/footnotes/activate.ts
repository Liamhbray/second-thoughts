import { Plugin } from "obsidian";
import { Services } from "../../core/services";
import { runFootnotes } from "./pipeline";

/**
 * Activate the footnotes feature.
 * Registers an idle handler that generates footnotes when notes go idle.
 */
export function activateFootnotes(
	_plugin: Plugin,
	services: Services
): void {
	services.idle.addHandler(async (file) => {
		if (!services.settings.enableFootnotes) return;
		if (!services.isBootstrapComplete()) return;
		await runFootnotes(file, services);
	});
}
