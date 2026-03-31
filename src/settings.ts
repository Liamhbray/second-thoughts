import { App, PluginSettingTab, Setting } from "obsidian";
import type SecondThoughtsPlugin from "./main";

export interface SecondThoughtsSettings {
	apiKey: string;
	idleDebounceMinutes: number;
	system1HopDepth: number;
	system2ScopeDefault: "folder" | "vault";
	topKPerCompartment: number;
	excludedFolders: string[];
	excludedTags: string[];
	agentTag: string;
}

export const DEFAULT_SETTINGS: SecondThoughtsSettings = {
	apiKey: "",
	idleDebounceMinutes: 5,
	system1HopDepth: 3,
	system2ScopeDefault: "folder",
	topKPerCompartment: 5,
	excludedFolders: [],
	excludedTags: [],
	agentTag: "@agent",
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

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Required for embedding generation and LLM calls. Your vault content is sent to OpenAI for processing.")
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
			.setName("System 2 — default scope")
			.setDesc("Default context boundary for @agent responses.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("folder", "Folder")
					.addOption("vault", "Vault")
					.setValue(this.plugin.settings.system2ScopeDefault)
					.onChange(async (value) => {
						this.plugin.settings.system2ScopeDefault = value as "folder" | "vault";
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

		new Setting(containerEl)
			.setName("Agent tag")
			.setDesc("The marker that triggers System 2 (ideation agent).")
			.addText((text) =>
				text
					.setPlaceholder("@agent")
					.setValue(this.plugin.settings.agentTag)
					.onChange(async (value) => {
						this.plugin.settings.agentTag = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
