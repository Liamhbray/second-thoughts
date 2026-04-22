import { Notice, Plugin } from "obsidian";
import { Services } from "../../core/services";
import { IdeationModal } from "./modal";

/**
 * Activate the ideation feature.
 * Registers the "Ask Second Thoughts" command.
 */
export function activateIdeation(
	plugin: Plugin,
	services: Services
): void {
	plugin.addCommand({
		id: "ideate",
		name: "Ask Second Thoughts",
		editorCallback: (editor, view) => {
			if (!view.file) return;
			if (!services.settings.enableIdeation) return;
			if (!services.settings.apiKey) {
				new Notice(
					"Second Thoughts: API key required. Set it in plugin settings."
				);
				return;
			}
			const selection = editor.getSelection();
			new IdeationModal(
				services.app,
				editor,
				selection,
				services.settings,
				services.index,
				services.llm,
				view.file.path,
				services.isApiPaused
			).open();
		},
	});
}
