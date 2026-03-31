import { Plugin } from "obsidian";
import {
	SecondThoughtsSettings,
	DEFAULT_SETTINGS,
	SecondThoughtsSettingTab,
} from "./settings";

export default class SecondThoughtsPlugin extends Plugin {
	settings: SecondThoughtsSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SecondThoughtsSettingTab(this.app, this));

		console.log("Second Thoughts: loaded");
	}

	onunload() {
		console.log("Second Thoughts: unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
