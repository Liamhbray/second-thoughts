import { App, PluginSettingTab, Setting } from "obsidian";
import type SecondThoughtsPlugin from "./main";

export interface SecondThoughtsSettings {
	apiKey: string;
	idleDebounceMinutes: number;
	system1HopDepth: number;
	topKPerCompartment: number;
	excludedFolders: string[];
	excludedTags: string[];
	ideationModel: string;
	// Legacy fields kept for backwards compat with existing data.json
	system2ScopeDefault?: "folder" | "vault";
	agentTag?: string;
}

export const DEFAULT_SETTINGS: SecondThoughtsSettings = {
	apiKey: "",
	idleDebounceMinutes: 5,
	system1HopDepth: 3,
	topKPerCompartment: 5,
	excludedFolders: [],
	excludedTags: [],
	ideationModel: "gpt-4o-mini",
};

export class SecondThoughtsSettingTab extends PluginSettingTab {
	plugin: SecondThoughtsPlugin;

	constructor(app: App, plugin: SecondThoughtsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Second Thoughts" });

		containerEl.createEl("p", {
			text: "This plugin sends vault content (note titles, tags, links, and body text) to OpenAI's API for embedding generation and LLM inference. Data is transmitted per note on first index and whenever a note changes. No data is stored by this plugin outside your vault.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Required for embedding generation and LLM calls.")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Idle debounce (minutes)")
			.setDesc("Time since last edit before a note is eligible for processing.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(String(this.plugin.settings.idleDebounceMinutes))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!isNaN(parsed) && parsed > 0) {
							this.plugin.settings.idleDebounceMinutes = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("System 1 — hop depth")
			.setDesc("Default link-hop boundary for relational proposals.")
			.addText((text) =>
				text
					.setPlaceholder("3")
					.setValue(String(this.plugin.settings.system1HopDepth))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!isNaN(parsed) && parsed >= 1) {
							this.plugin.settings.system1HopDepth = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Ideation model")
			.setDesc("OpenAI model for idea generation. gpt-4o-mini is fast and cheap; gpt-4o is more creative.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("gpt-4o-mini", "gpt-4o-mini")
					.addOption("gpt-4o", "gpt-4o")
					.setValue(this.plugin.settings.ideationModel)
					.onChange(async (value) => {
						this.plugin.settings.ideationModel = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Top-K per compartment")
			.setDesc("Maximum notes retrieved per similarity search (up to 4× this value total before deduplication).")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(String(this.plugin.settings.topKPerCompartment))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!isNaN(parsed) && parsed >= 1) {
							this.plugin.settings.topKPerCompartment = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Comma-separated list of folders exempt from all processing.")
			.addText((text) =>
				text
					.setPlaceholder("templates, archive")
					.setValue(this.plugin.settings.excludedFolders.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded tags")
			.setDesc("Comma-separated list of tags. Notes with these tags are exempt.")
			.addText((text) =>
				text
					.setPlaceholder("#private, #draft")
					.setValue(this.plugin.settings.excludedTags.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedTags = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

	}
}
