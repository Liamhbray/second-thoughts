// Minimal type stubs so vitest can resolve imports from 'obsidian'.
// Only provides types — no behaviour. Tests must not call Obsidian APIs.
export class TFile {
	path = "";
	basename = "";
	extension = "md";
	stat = { mtime: 0, ctime: 0, size: 0 };
}
export class TAbstractFile {
	path = "";
}
export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class WorkspaceLeaf {}
export function requestUrl(): any {}
