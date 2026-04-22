import { App, PluginSettingTab, Setting } from "obsidian";
import type SecondThoughtsPlugin from "../main";

export interface SecondThoughtsSettings {
	apiKey: string;
	idleDebounceMinutes: number;
	footnoteLinkDepth: number;
	topK: number;
	excludedFolders: string[];
	excludedTags: string[];
	footnoteThreshold: number;
	ideationModel: string;
	ideasPerGeneration: number;
	enableFootnotes: boolean;
	enableIdeation: boolean;
}

export const DEFAULT_SETTINGS: SecondThoughtsSettings = {
	apiKey: "",
	idleDebounceMinutes: 5,
	footnoteLinkDepth: 3,
	topK: 5,
	excludedFolders: [],
	excludedTags: [],
	footnoteThreshold: 0.5,
	ideationModel: "gpt-4o-mini",
	ideasPerGeneration: 3,
	enableFootnotes: true,
	enableIdeation: true,
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
						this.plugin.onApiKeyChanged();
					})
			);

		// --- Feature toggles ---

		containerEl.createEl("h3", { text: "Features" });

		new Setting(containerEl)
			.setName("Enable footnotes")
			.setDesc("Automatically discover connections and add them as footnotes when a note goes idle.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableFootnotes)
					.onChange(async (value) => {
						this.plugin.settings.enableFootnotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable ideation")
			.setDesc("Show the \"Ask Second Thoughts\" command for generating bridging ideas.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableIdeation)
					.onChange(async (value) => {
						this.plugin.settings.enableIdeation = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Footnote settings ---

		containerEl.createEl("h3", { text: "Footnotes" });

		new Setting(containerEl)
			.setName("Processing delay (minutes)")
			.setDesc("Time since last edit before a note is eligible for footnote generation.")
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
			.setName("Footnote link depth")
			.setDesc("How many link hops to search for related notes.")
			.addText((text) =>
				text
					.setPlaceholder("3")
					.setValue(String(this.plugin.settings.footnoteLinkDepth))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!isNaN(parsed) && parsed >= 1) {
							this.plugin.settings.footnoteLinkDepth = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Retrieval depth")
			.setDesc("Number of similar notes to consider per search.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(String(this.plugin.settings.topK))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (!isNaN(parsed) && parsed >= 1) {
							this.plugin.settings.topK = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Connection confidence")
			.setDesc("Minimum similarity score (0.0–1.0) for a footnote to be generated. Lower = more footnotes, higher = fewer but stronger connections.")
			.addSlider((slider) =>
				slider
					.setLimits(0.2, 0.9, 0.05)
					.setValue(this.plugin.settings.footnoteThreshold)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.footnoteThreshold = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Ideation settings ---

		containerEl.createEl("h3", { text: "Ideation" });

		new Setting(containerEl)
			.setName("Ideation model")
			.setDesc("gpt-4o-mini is fast and cheap; gpt-4o is more creative.")
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
			.setName("Ideas per generation")
			.setDesc("Number of bridging ideas to generate per request.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("1", "1")
					.addOption("2", "2")
					.addOption("3", "3")
					.addOption("5", "5")
					.setValue(String(this.plugin.settings.ideasPerGeneration))
					.onChange(async (value) => {
						this.plugin.settings.ideasPerGeneration = Number(value);
						await this.plugin.saveSettings();
					})
			);

		// --- Exclusions ---

		containerEl.createEl("h3", { text: "Exclusions" });

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
