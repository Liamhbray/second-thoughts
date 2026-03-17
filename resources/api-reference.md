# Obsidian Plugin API Reference

> Comprehensive offline reference for the Obsidian Plugin API.
> Based on the official `obsidian.d.ts` type definitions and Obsidian developer documentation.

---

## Table of Contents

1. [Plugin Class (Lifecycle)](#1-plugin-class-lifecycle)
2. [Vault API](#2-vault-api)
3. [MetadataCache API](#3-metadatacache-api)
4. [Workspace API](#4-workspace-api)
5. [FileManager API](#5-filemanager-api)
6. [Editor API](#6-editor-api)
7. [UI APIs](#7-ui-apis)
   - [Commands](#71-commands)
   - [Ribbon Icons](#72-ribbon-icons)
   - [Status Bar](#73-status-bar)
   - [Modal](#74-modal)
   - [Notice](#75-notice)
   - [Setting](#76-setting)
   - [PluginSettingTab](#77-pluginsettingtab)
8. [Events System](#8-events-system)
9. [File Types: TFile, TFolder, TAbstractFile](#9-file-types-tfile-tfolder-tabstractfile)
10. [MarkdownView](#10-markdownview)
11. [MarkdownPostProcessorContext](#11-markdownpostprocessorcontext)
12. [Supporting Types and Interfaces](#12-supporting-types-and-interfaces)

---

## 1. Plugin Class (Lifecycle)

The `Plugin` class is the base class all Obsidian plugins extend. It inherits from `Component`.

```typescript
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
    async onload() { /* initialization */ }
    onunload() { /* cleanup */ }
}
```

### Properties

| Property   | Type              | Description                                      |
|------------|-------------------|--------------------------------------------------|
| `app`      | `App`             | Reference to the global App instance.            |
| `manifest` | `PluginManifest`  | The plugin's manifest (id, name, version, etc.). |

### Lifecycle Methods

#### `onload()`
```typescript
onload(): Promise<void> | void;
```
Called when the plugin is loaded and activated. Use this to register commands, events, views, settings tabs, ribbon icons, etc. Can be async.

#### `onunload()`
```typescript
onunload(): void;
```
Called when the plugin is disabled or Obsidian is closing. All resources registered via `registerEvent`, `registerDomEvent`, `registerInterval`, and `register` are automatically cleaned up. Use this for any additional manual cleanup.

### Data Persistence

#### `loadData()`
```typescript
loadData(): Promise<any>;
```
Loads the plugin's saved data from disk (`data.json` in the plugin folder). Returns a Promise that resolves with the stored data object, or `null`/`undefined` if no data has been saved yet.

**Typical usage pattern:**
```typescript
async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}
```

#### `saveData()`
```typescript
saveData(data: any): Promise<void>;
```
Saves data to the plugin's `data.json` file on disk. The data parameter should be a JSON-serializable object.

**Typical usage pattern:**
```typescript
async saveSettings() {
    await this.saveData(this.settings);
}
```

### Registration Methods

#### `addCommand()`
```typescript
addCommand(command: Command): Command;
```
Registers a command that appears in the Command Palette. See [Commands](#71-commands) for the `Command` interface.

#### `addRibbonIcon()`
```typescript
addRibbonIcon(icon: IconName, title: string, callback: (evt: MouseEvent) => any): HTMLElement;
```
Adds a clickable icon to the left sidebar ribbon. Returns the HTMLElement for the icon.

#### `addStatusBarItem()`
```typescript
addStatusBarItem(): HTMLElement;
```
Adds an item to the status bar at the bottom of the app. Returns the HTMLElement which you can modify (e.g., `el.setText('...')`).

#### `addSettingTab()`
```typescript
addSettingTab(settingTab: PluginSettingTab): void;
```
Registers a settings tab for the plugin that appears under Settings > Community Plugins.

#### `registerEvent()`
```typescript
registerEvent(eventRef: EventRef): void;
```
Registers an event reference so it is automatically detached when the plugin unloads. Use with `.on()` from Vault, Workspace, MetadataCache, etc.

```typescript
this.registerEvent(
    this.app.vault.on('create', (file) => { /* ... */ })
);
```

#### `registerDomEvent()`
```typescript
// For HTMLElement events:
registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): void;

// For Document events:
registerDomEvent<K extends keyof DocumentEventMap>(
    el: Document,
    type: K,
    callback: (this: Document, ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): void;

// For Window events:
registerDomEvent<K extends keyof WindowEventMap>(
    el: Window,
    type: K,
    callback: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): void;
```
Registers a DOM event listener that is automatically removed on unload. Use for events on `document`, `window`, or persistent elements.

#### `registerInterval()`
```typescript
registerInterval(id: number): number;
```
Registers a `setInterval` timer that is automatically cleared on unload. Pass the return value of `window.setInterval()`.

```typescript
this.registerInterval(
    window.setInterval(() => { /* ... */ }, 30000)
);
```

#### `register()`
```typescript
register(cb: () => any): void;
```
Registers a generic cleanup callback that runs on unload.

#### `registerMarkdownPostProcessor()`
```typescript
registerMarkdownPostProcessor(
    postProcessor: MarkdownPostProcessor,
    sortOrder?: number
): MarkdownPostProcessor;
```
Registers a post-processor to modify how markdown renders in reading mode. The post-processor receives `(el: HTMLElement, ctx: MarkdownPostProcessorContext)`.

```typescript
type MarkdownPostProcessor = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void;
```

#### `registerMarkdownCodeBlockProcessor()`
```typescript
registerMarkdownCodeBlockProcessor(
    language: string,
    handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<any> | void,
    sortOrder?: number
): MarkdownPostProcessor;
```
Registers a handler for code blocks of a specific language (e.g., `'chart'`, `'mermaid-custom'`).

#### `registerView()`
```typescript
registerView(
    type: string,
    viewCreator: (leaf: WorkspaceLeaf) => View
): void;
```
Registers a custom view type.

---

## 2. Vault API

Access via `this.app.vault`. The `Vault` class extends `Events` and manages all files and folders in the vault.

### Reading Files

#### `read()`
```typescript
read(file: TFile): Promise<string>;
```
Reads the plaintext content of a file directly from disk. Use this when you intend to modify the content and write it back. Returns a Promise resolving to the file content string.

#### `cachedRead()`
```typescript
cachedRead(file: TFile): Promise<string>;
```
Reads the plaintext content of a file using the in-memory cache. Faster than `read()` and suitable for display purposes where you do not need to modify and save the content back.

### Writing Files

#### `create()`
```typescript
create(path: string, data: string, options?: DataWriteOptions): Promise<TFile>;
```
Creates a new plaintext file at the specified path with the given content. Returns a Promise resolving to the new `TFile`. Throws if the file already exists.

#### `modify()`
```typescript
modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
```
Replaces the entire content of an existing file with new data.

#### `append()`
```typescript
append(file: TFile, data: string, options?: DataWriteOptions): Promise<void>;
```
Appends text to the end of a file.

#### `process()`
```typescript
process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
```
Atomically reads, transforms, and saves a file. The callback receives the current content and must return the new content. This guarantees the file is not modified between read and write. **Always prefer `process()` over manual `read()`/`modify()` sequences.** Returns the new file content.

```typescript
await this.app.vault.process(file, (data) => {
    return data.replace(':)', ':-D');
});
```

### Deleting Files

#### `delete()`
```typescript
delete(file: TAbstractFile, force?: boolean): Promise<void>;
```
Permanently deletes a file or folder. Set `force` to `true` to delete folders even if they contain hidden children.

#### `trash()`
```typescript
trash(file: TAbstractFile, system: boolean): Promise<void>;
```
Moves a file or folder to the trash. If `system` is `true`, uses the system trash; if `false`, uses Obsidian's `.trash` folder.

### Renaming / Moving

#### `rename()`
```typescript
rename(file: TAbstractFile, newPath: string): Promise<void>;
```
Renames or moves a file/folder to a new path. **Does NOT update internal links** -- use `FileManager.renameFile()` for that.

### Folder Operations

#### `createFolder()`
```typescript
createFolder(path: string): Promise<TFolder>;
```
Creates a new folder at the specified path. Throws if the folder already exists.

### Retrieving Files and Folders

#### `getAbstractFileByPath()`
```typescript
getAbstractFileByPath(path: string): TAbstractFile | null;
```
Returns the file or folder at the given path, or `null` if not found. Use `instanceof TFile` or `instanceof TFolder` to check the type.

#### `getFileByPath()`
```typescript
getFileByPath(path: string): TFile | null;
```
Returns the file at the given path, or `null` if not found or if it is a folder. (Added in v1.5.7.)

#### `getFolderByPath()`
```typescript
getFolderByPath(path: string): TFolder | null;
```
Returns the folder at the given path, or `null` if not found or if it is a file. (Added in v1.5.7.)

#### `getFiles()`
```typescript
getFiles(): TFile[];
```
Returns an array of all files in the vault (all types, not just markdown).

#### `getMarkdownFiles()`
```typescript
getMarkdownFiles(): TFile[];
```
Returns an array of all markdown (`.md`) files in the vault.

#### `getAllLoadedFiles()`
```typescript
getAllLoadedFiles(): TAbstractFile[];
```
Returns an array of every file and folder currently loaded in the vault.

#### `getRoot()`
```typescript
getRoot(): TFolder;
```
Returns the root folder of the vault.

#### `getName()`
```typescript
getName(): string;
```
Returns the name of the vault.

### Vault Events

All vault events return an `EventRef`. Register them via `this.registerEvent()` in your plugin.

#### `on('create')`
```typescript
on(name: 'create', callback: (file: TAbstractFile) => any, ctx?: any): EventRef;
```
Fired when a file or folder is created. **Also fires for each file during vault load** -- use `this.app.workspace.onLayoutReady()` to avoid processing initial load events.

#### `on('modify')`
```typescript
on(name: 'modify', callback: (file: TAbstractFile) => any, ctx?: any): EventRef;
```
Fired when a file's content is modified.

#### `on('delete')`
```typescript
on(name: 'delete', callback: (file: TAbstractFile) => any, ctx?: any): EventRef;
```
Fired when a file or folder is deleted.

#### `on('rename')`
```typescript
on(name: 'rename', callback: (file: TAbstractFile, oldPath: string) => any, ctx?: any): EventRef;
```
Fired when a file or folder is renamed or moved. The second argument is the old path.

---

## 3. MetadataCache API

Access via `this.app.metadataCache`. The `MetadataCache` class extends `Events` and provides cached parsed metadata for all files in the vault.

### Properties

#### `resolvedLinks`
```typescript
resolvedLinks: Record<string, Record<string, number>>;
```
A nested map: `resolvedLinks[sourcePath][destPath]` = number of links from source to destination. Only includes links that resolve to an existing file.

#### `unresolvedLinks`
```typescript
unresolvedLinks: Record<string, Record<string, number>>;
```
Same structure as `resolvedLinks`, but for links that do NOT resolve to any existing file.

### Methods

#### `getFileCache()`
```typescript
getFileCache(file: TFile): CachedMetadata | null;
```
Returns the cached metadata for a file, or `null` if the file has not been indexed yet. The returned `CachedMetadata` object contains headings, links, tags, frontmatter, embeds, blocks, sections, and list items.

#### `getCache()`
```typescript
getCache(path: string): CachedMetadata | null;
```
Same as `getFileCache` but accepts a file path string instead of a `TFile` object.

#### `getFirstLinkpathDest()`
```typescript
getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
```
Resolves a link path (e.g., `"My Note"` or `"folder/My Note"`) relative to a source file path. Returns the resolved `TFile`, or `null` if the link cannot be resolved.

#### `fileToLinktext()`
```typescript
fileToLinktext(file: TFile, sourcePath: string, omitMdExtension?: boolean): string;
```
Generates the shortest link text to `file` from the perspective of `sourcePath`.

### MetadataCache Events

#### `on('changed')`
```typescript
on(name: 'changed', callback: (file: TFile, data: string, cache: CachedMetadata) => any, ctx?: any): EventRef;
```
Fired when a file's metadata cache is updated. Receives the file, its raw content, and the new cached metadata.

#### `on('resolve')`
```typescript
on(name: 'resolve', callback: (file: TFile) => any, ctx?: any): EventRef;
```
Fired when a single file's links have been resolved.

#### `on('resolved')`
```typescript
on(name: 'resolved', callback: () => any, ctx?: any): EventRef;
```
Fired when all files in the vault have had their metadata resolved. Useful for running operations that depend on the entire link graph being available.

### CachedMetadata Interface

```typescript
export interface CachedMetadata {
    blocks?: Record<string, BlockCache>;
    embeds?: EmbedCache[];
    footnoteRefs?: FootnoteRefCache[];
    footnotes?: FootnoteCache[];
    frontmatter?: FrontMatterCache;
    frontmatterLinks?: FrontmatterLinkCache[];
    frontmatterPosition?: Pos;
    headings?: HeadingCache[];
    links?: LinkCache[];
    listItems?: ListItemCache[];
    referenceLinks?: ReferenceLinkCache[];
    sections?: SectionCache[];
    tags?: TagCache[];
}
```

---

## 4. Workspace API

Access via `this.app.workspace`. The `Workspace` class extends `Events` and manages the UI layout -- panes, tabs, splits, and views.

### Methods

#### `getActiveFile()`
```typescript
getActiveFile(): TFile | null;
```
Returns the file for the currently active view (if it's a FileView), or the most recently active file. Returns `null` if no file has been opened.

#### `getActiveViewOfType()`
```typescript
getActiveViewOfType<T extends View>(type: Constructor<T>): T | null;
```
Returns the active view if it matches the given type, or `null`. Commonly used with `MarkdownView`.

```typescript
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
    const editor = view.editor;
    // work with editor
}
```

#### `getLeaf()`
```typescript
// Get existing leaf or create new based on parameter:
getLeaf(newLeaf?: boolean): WorkspaceLeaf;           // false = reuse active, true = new tab
getLeaf(newLeaf?: PaneType): WorkspaceLeaf;           // 'tab' | 'split' | 'window'
```
Returns a `WorkspaceLeaf` to open a file in. `PaneType` values:
- `'tab'` -- new tab in current split
- `'split'` -- new split pane
- `'window'` -- new pop-out window
- `false` or omitted -- reuse active leaf
- `true` -- alias for `'tab'`

#### `getLeavesOfType()`
```typescript
getLeavesOfType(viewType: string): WorkspaceLeaf[];
```
Returns all leaves that have a view of the specified type (e.g., `'markdown'`, `'graph'`, or a custom view type).

#### `revealLeaf()`
```typescript
revealLeaf(leaf: WorkspaceLeaf): void;
```
Ensures the leaf is visible by revealing it (e.g., opening its sidebar if it is in one).

#### `iterateAllLeaves()`
```typescript
iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => any): void;
```
Calls the callback for every leaf in the workspace.

#### `detachLeavesOfType()`
```typescript
detachLeavesOfType(viewType: string): void;
```
Closes all leaves of the specified view type.

#### `onLayoutReady()`
```typescript
onLayoutReady(callback: () => any): void;
```
Runs the callback when the workspace layout is fully loaded. If the layout is already ready, runs immediately. Use this to avoid processing vault `'create'` events that fire during initial load.

#### `getRightLeaf()`
```typescript
getRightLeaf(shouldSplit: boolean): WorkspaceLeaf;
```
Gets a leaf in the right sidebar. If `shouldSplit` is `true`, creates a new split.

#### `getLeftLeaf()`
```typescript
getLeftLeaf(shouldSplit: boolean): WorkspaceLeaf;
```
Gets a leaf in the left sidebar. If `shouldSplit` is `true`, creates a new split.

### Workspace Events

#### `on('file-open')`
```typescript
on(name: 'file-open', callback: (file: TFile | null) => any, ctx?: any): EventRef;
```
Fired when the active file changes. The file can be in a new leaf, existing leaf, or embed. Receives `null` if no file is open.

#### `on('active-leaf-change')`
```typescript
on(name: 'active-leaf-change', callback: (leaf: WorkspaceLeaf | null) => any, ctx?: any): EventRef;
```
Fired when the active leaf changes. Receives `null` if no leaf is active.

#### `on('layout-change')`
```typescript
on(name: 'layout-change', callback: () => any, ctx?: any): EventRef;
```
Fired when the workspace layout changes (leaves opened, closed, rearranged, etc.).

#### `on('editor-change')`
```typescript
on(name: 'editor-change', callback: (editor: Editor, info: MarkdownView | MarkdownFileInfo) => any, ctx?: any): EventRef;
```
Fired when any editor content changes.

#### `on('quit')`
```typescript
on(name: 'quit', callback: (tasks: Tasks) => any, ctx?: any): EventRef;
```
Fired when the app is about to quit. Allows registering async tasks that must complete before shutdown.

### WorkspaceLeaf

```typescript
class WorkspaceLeaf {
    view: View;
    openFile(file: TFile, openState?: OpenViewState): Promise<void>;
    getViewState(): ViewState;
    setViewState(viewState: ViewState, eState?: any): Promise<void>;
    detach(): void;
    getDisplayText(): string;
}
```

---

## 5. FileManager API

Access via `this.app.fileManager`. Provides high-level file operations that respect Obsidian's link-management settings.

### `processFrontMatter()`
```typescript
processFrontMatter(
    file: TFile,
    fn: (frontmatter: any) => void,
    options?: DataWriteOptions
): Promise<void>;
```
Atomically reads, modifies, and saves the YAML frontmatter of a markdown file. The frontmatter is passed as a plain JS object -- mutate it directly within the callback.

**Always prefer this over manually parsing YAML.** It handles YAML formatting consistently and prevents conflicts with other plugins modifying the same file.

```typescript
await this.app.fileManager.processFrontMatter(file, (fm) => {
    fm['key1'] = 'value1';
    delete fm['key2'];
    fm['tags'] = ['tag1', 'tag2'];
});
```

### `renameFile()`
```typescript
renameFile(file: TAbstractFile, newPath: string): Promise<void>;
```
Renames or moves a file/folder and **automatically updates all internal links** pointing to it, based on the user's link-update preference. Use this instead of `Vault.rename()` when you want links to be updated.

### `generateMarkdownLink()`
```typescript
generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
```
Generates a markdown link string to the given file, relative to `sourcePath`. Respects the user's link format preference (wikilinks vs. markdown links).

### `getNewFileParent()`
```typescript
getNewFileParent(sourcePath: string): TFolder;
```
Returns the folder where a new file should be created based on the user's "Default location for new notes" setting, relative to the source path.

---

## 6. Editor API

The `Editor` abstract class provides an interface to the CodeMirror editor within a `MarkdownView`. Access it via `view.editor` or through an `editorCallback` command.

### Content Methods

#### `getValue()`
```typescript
abstract getValue(): string;
```
Returns the entire content of the editor as a string.

#### `setValue()`
```typescript
abstract setValue(content: string): void;
```
Replaces the entire editor content.

#### `getLine()`
```typescript
abstract getLine(line: number): string;
```
Returns the text of a specific line (0-indexed).

#### `setLine()`
```typescript
setLine(n: number, text: string): void;
```
Replaces the content of a specific line (0-indexed).

#### `lineCount()`
```typescript
abstract lineCount(): number;
```
Returns the total number of lines in the editor.

#### `lastLine()`
```typescript
lastLine(): number;
```
Returns the line number of the last line (equivalent to `lineCount() - 1`).

### Selection Methods

#### `getSelection()`
```typescript
abstract getSelection(): string;
```
Returns the currently selected text, or an empty string if nothing is selected.

#### `getRange()`
```typescript
abstract getRange(from: EditorPosition, to: EditorPosition): string;
```
Returns the text between two positions.

#### `replaceSelection()`
```typescript
abstract replaceSelection(replacement: string, origin?: string): void;
```
Replaces the current selection with the given text. If nothing is selected, inserts text at the cursor.

#### `replaceRange()`
```typescript
abstract replaceRange(
    replacement: string,
    from: EditorPosition,
    to?: EditorPosition,
    origin?: string
): void;
```
Replaces text between `from` and `to`. If `to` is omitted, inserts at `from`.

#### `setSelection()`
```typescript
setSelection(anchor: EditorPosition, head?: EditorPosition): void;
```
Sets the selection range. If `head` is omitted, sets a cursor (zero-width selection).

#### `somethingSelected()`
```typescript
somethingSelected(): boolean;
```
Returns `true` if there is an active text selection.

#### `listSelections()`
```typescript
abstract listSelections(): EditorSelection[];
```
Returns an array of all current selections (supports multiple cursors).

### Cursor Methods

#### `getCursor()`
```typescript
abstract getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;
```
Returns the current cursor position. The optional `side` parameter specifies which end of a selection to return.

#### `setCursor()`
```typescript
setCursor(pos: EditorPosition): void;
setCursor(line: number, ch?: number): void;
```
Moves the cursor to the specified position.

### Navigation and Scrolling

#### `scrollIntoView()`
```typescript
scrollIntoView(range: EditorRange, center?: boolean): void;
```
Scrolls the editor to ensure the given range is visible. If `center` is `true`, centers it.

```typescript
interface EditorRange {
    from: EditorPosition;
    to: EditorPosition;
}
```

#### `focus()`
```typescript
focus(): void;
```
Focuses the editor.

#### `blur()`
```typescript
blur(): void;
```
Removes focus from the editor.

### Advanced Methods

#### `wordAt()`
```typescript
wordAt(pos: EditorPosition): EditorRange | null;
```
Returns the range of the word at the given position, or `null`.

#### `posToOffset()`
```typescript
posToOffset(pos: EditorPosition): number;
```
Converts an `EditorPosition` (line/ch) to a character offset from the start of the document.

#### `offsetToPos()`
```typescript
offsetToPos(offset: number): EditorPosition;
```
Converts a character offset to an `EditorPosition`.

#### `exec()`
```typescript
exec(command: EditorCommandName): void;
```
Executes a built-in editor command by name.

#### `transaction()`
```typescript
transaction(tx: EditorTransaction): void;
```
Applies a transaction (a batch of changes) atomically.

```typescript
interface EditorTransaction {
    replaceSelection?: string;
    selections?: EditorRangeOrCaret[];
    changes?: EditorChange[];
}

interface EditorChange {
    text: string;
    from: EditorPosition;
    to?: EditorPosition;
}
```

### EditorPosition Interface

```typescript
export interface EditorPosition {
    line: number;  // 0-indexed line number
    ch: number;    // 0-indexed character offset within the line
}
```

### EditorSelection Interface

```typescript
export interface EditorSelection {
    anchor: EditorPosition;
    head: EditorPosition;
}
```

---

## 7. UI APIs

### 7.1 Commands

Commands appear in the Command Palette and can have keyboard shortcuts.

```typescript
export interface Command {
    /** Unique identifier for the command (should be kebab-case). */
    id: string;

    /** Human-readable name displayed in the palette. */
    name: string;

    /** Simple callback. Mutually exclusive with other callback types. */
    callback?: () => any;

    /**
     * Conditional callback. Called with `checking=true` to test availability,
     * then with `checking=false` to execute. Return `true` when available.
     */
    checkCallback?: (checking: boolean) => boolean | void;

    /** Callback that only runs when an editor is active. */
    editorCallback?: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => any;

    /** Conditional editor callback. */
    editorCheckCallback?: (
        checking: boolean,
        editor: Editor,
        ctx: MarkdownView | MarkdownFileInfo
    ) => boolean | void;

    /** Default hotkeys for the command. */
    hotkeys?: Hotkey[];

    /** Icon name from Lucide icons (https://lucide.dev). */
    icon?: IconName;

    /** If true, only shown on mobile. */
    mobileOnly?: boolean;

    /** If true, holding the hotkey repeats the command. */
    repeatable?: boolean;
}

export interface Hotkey {
    modifiers: Modifier[];
    key: string;
}

export type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt';
```

**Usage example with `editorCallback`:**
```typescript
this.addCommand({
    id: 'insert-timestamp',
    name: 'Insert Timestamp',
    editorCallback: (editor: Editor, view: MarkdownView) => {
        editor.replaceSelection(new Date().toLocaleString());
    }
});
```

**Usage example with `checkCallback`:**
```typescript
this.addCommand({
    id: 'do-thing',
    name: 'Do Thing',
    checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            if (!checking) {
                // execute the action
            }
            return true;
        }
        return false;
    }
});
```

### 7.2 Ribbon Icons

```typescript
addRibbonIcon(icon: IconName, title: string, callback: (evt: MouseEvent) => any): HTMLElement;
```

Adds a clickable icon to the left sidebar ribbon. Uses Lucide icon names.

```typescript
this.addRibbonIcon('dice', 'My Plugin', (evt) => {
    new Notice('Ribbon icon clicked!');
});
```

### 7.3 Status Bar

```typescript
addStatusBarItem(): HTMLElement;
```

Returns an `HTMLElement` appended to the status bar. Modify it with `.setText()` or standard DOM methods.

```typescript
const statusBar = this.addStatusBarItem();
statusBar.setText('Ready');
```

### 7.4 Modal

The `Modal` class creates dialog overlays. Extend it and implement `onOpen()` and `onClose()`.

```typescript
export class Modal {
    /** The App instance. */
    app: App;

    /** The outer container element of the modal. */
    containerEl: HTMLElement;

    /** The content container -- add your UI here. */
    contentEl: HTMLElement;

    /** The modal's root element. */
    modalEl: HTMLElement;

    /** The title element (can set text or HTML). */
    titleEl: HTMLElement;

    /** Scope for keyboard shortcuts within the modal. */
    scope: Scope;

    constructor(app: App);

    /** Opens (displays) the modal. */
    open(): void;

    /** Closes (hides and removes) the modal. */
    close(): void;

    /** Called when the modal is opened. Add your content here. */
    onOpen(): void;

    /** Called when the modal is closed. Clean up here. */
    onClose(): void;
}
```

**Usage:**
```typescript
class MyModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Hello' });
        contentEl.createEl('p', { text: 'This is a modal.' });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Close')
                .setCta()
                .onClick(() => this.close()));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Open it:
new MyModal(this.app).open();
```

### 7.5 Notice

The `Notice` class displays toast notifications at the top-right of the screen.

```typescript
export class Notice {
    /** The HTML element of the notice. */
    noticeEl: HTMLElement;

    /**
     * @param message - Text or DocumentFragment to display.
     * @param duration - Duration in milliseconds. Default: 5000. Set to 0 for persistent.
     */
    constructor(message: string | DocumentFragment, duration?: number);

    /** Updates the notice message. */
    setMessage(message: string | DocumentFragment): this;

    /** Immediately hides and removes the notice. */
    hide(): void;
}
```

**Usage:**
```typescript
// Simple notice (auto-dismisses after 5 seconds)
new Notice('Operation complete!');

// Short notice
new Notice('Saved!', 2000);

// Persistent notice (dismiss manually)
const notice = new Notice('Processing...', 0);
// Later:
notice.setMessage('Done!');
setTimeout(() => notice.hide(), 2000);

// Notice with custom content
const frag = document.createDocumentFragment();
frag.createEl('span', { text: 'Click: ' });
const btn = frag.createEl('button', { text: 'Undo' });
btn.addEventListener('click', () => { /* undo logic */ });
new Notice(frag, 0);
```

### 7.6 Setting

The `Setting` class creates a single setting row in a settings tab or modal.

```typescript
export class Setting {
    /** The root element of the setting row. */
    settingEl: HTMLElement;

    /** Container for the name and description. */
    infoEl: HTMLElement;

    /** The name element. */
    nameEl: HTMLElement;

    /** The description element. */
    descEl: HTMLElement;

    /** Container for the controls (inputs, toggles, etc.). */
    controlEl: HTMLElement;

    /**
     * @param containerEl - The parent element to append this setting to.
     */
    constructor(containerEl: HTMLElement);

    setName(name: string | DocumentFragment): this;
    setDesc(desc: string | DocumentFragment): this;
    setClass(cls: string): this;
    setTooltip(tooltip: string): this;
    setDisabled(disabled: boolean): this;

    /** Adds a text input control. */
    addText(cb: (text: TextComponent) => any): this;

    /** Adds a multi-line text area. */
    addTextArea(cb: (textArea: TextAreaComponent) => any): this;

    /** Adds a toggle switch. */
    addToggle(cb: (toggle: ToggleComponent) => any): this;

    /** Adds a slider control. */
    addSlider(cb: (slider: SliderComponent) => any): this;

    /** Adds a dropdown select. */
    addDropdown(cb: (dropdown: DropdownComponent) => any): this;

    /** Adds a button. */
    addButton(cb: (button: ButtonComponent) => any): this;

    /** Adds a color picker. */
    addColorPicker(cb: (colorPicker: ColorComponent) => any): this;

    /** Adds a search input. */
    addSearch(cb: (search: SearchComponent) => any): this;

    /** Adds a Moment.js format input. */
    addMomentFormat(cb: (momentFormat: MomentFormatComponent) => any): this;

    /** Chains additional configuration. */
    then(cb: (setting: this) => any): this;
}
```

**Common component methods:**

```typescript
// TextComponent
text.setPlaceholder(placeholder: string): this;
text.setValue(value: string): this;
text.onChange(callback: (value: string) => any): this;

// ToggleComponent
toggle.setValue(value: boolean): this;
toggle.onChange(callback: (value: boolean) => any): this;

// SliderComponent
slider.setLimits(min: number, max: number, step: number | 'any'): this;
slider.setValue(value: number): this;
slider.setDynamicTooltip(): this;
slider.onChange(callback: (value: number) => any): this;

// DropdownComponent
dropdown.addOption(value: string, display: string): this;
dropdown.addOptions(options: Record<string, string>): this;
dropdown.setValue(value: string): this;
dropdown.onChange(callback: (value: string) => any): this;

// ButtonComponent
button.setButtonText(name: string): this;
button.setIcon(icon: IconName): this;
button.setCta(): this;       // call-to-action styling (primary)
button.setWarning(): this;   // warning/destructive styling
button.onClick(callback: (evt: MouseEvent) => any): this;

// ColorComponent
color.setValue(value: string): this;   // hex color string
color.onChange(callback: (value: string) => any): this;
```

### 7.7 PluginSettingTab

Extend `PluginSettingTab` to create a settings page for your plugin.

```typescript
export class PluginSettingTab {
    /** The App instance. */
    app: App;

    /** The plugin instance. */
    plugin: Plugin;

    /** The container element to render settings into. */
    containerEl: HTMLElement;

    constructor(app: App, plugin: Plugin);

    /** Called when the settings tab is displayed. Build your UI here. */
    display(): void;

    /** Called when the tab is hidden. */
    hide(): void;
}
```

**Usage:**
```typescript
class MySettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('My Setting')
            .setDesc('Description of the setting')
            .addText(text => text
                .setPlaceholder('Enter value')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
```

---

## 8. Events System

Obsidian uses a custom event system based on the `Events` class. Classes like `Vault`, `Workspace`, and `MetadataCache` extend `Events`.

### Core Pattern

```typescript
// Subscribe to an event (returns an EventRef):
const ref: EventRef = emitter.on('event-name', callback);

// Unsubscribe:
emitter.offref(ref);

// In a plugin, always use registerEvent for automatic cleanup:
this.registerEvent(
    this.app.vault.on('modify', (file) => { /* ... */ })
);
```

### Plugin Registration Methods

| Method               | Signature                                                                 | Description                                       |
|----------------------|---------------------------------------------------------------------------|---------------------------------------------------|
| `registerEvent`      | `registerEvent(eventRef: EventRef): void`                                 | Auto-detaches on plugin unload.                   |
| `registerDomEvent`   | `registerDomEvent(el, type, callback, options?): void`                    | DOM event listener, auto-removed on unload.       |
| `registerInterval`   | `registerInterval(id: number): number`                                    | `setInterval` timer, auto-cleared on unload.      |
| `register`           | `register(cb: () => any): void`                                          | Generic cleanup callback, called on unload.       |

### Important: Always Use `registerEvent`

Never subscribe to events with `.on()` alone inside a plugin -- always wrap in `this.registerEvent()` to avoid memory leaks:

```typescript
// CORRECT:
this.registerEvent(this.app.vault.on('modify', callback));

// WRONG -- will leak if not manually cleaned up:
this.app.vault.on('modify', callback);
```

### EventRef Type

```typescript
// Opaque type representing a registered event subscription.
// Used with registerEvent() and offref().
type EventRef = { /* internal */ };
```

---

## 9. File Types: TFile, TFolder, TAbstractFile

### TAbstractFile (Base Class)

The abstract base class for both files and folders.

```typescript
export abstract class TAbstractFile {
    /** The file or folder name (including extension for files). */
    name: string;

    /** The parent folder, or null if this is the vault root. */
    parent: TFolder | null;

    /** Full path within the vault (e.g., "folder/subfolder/note.md"). */
    path: string;

    /** Reference to the Vault instance this belongs to. */
    vault: Vault;
}
```

### TFile

Represents a file in the vault. Extends `TAbstractFile`.

```typescript
export class TFile extends TAbstractFile {
    /** File name without extension (e.g., "my-note" for "my-note.md"). */
    basename: string;

    /** File extension without the dot (e.g., "md", "png", "pdf"). */
    extension: string;

    /** File metadata: size, creation time, modification time. */
    stat: FileStats;

    // Inherited from TAbstractFile:
    name: string;       // "my-note.md"
    parent: TFolder | null;
    path: string;       // "folder/my-note.md"
    vault: Vault;
}
```

### TFolder

Represents a folder in the vault. Extends `TAbstractFile`.

```typescript
export class TFolder extends TAbstractFile {
    /** Direct children (files and subfolders) of this folder. */
    children: TAbstractFile[];

    /** Returns true if this is the vault root folder. */
    isRoot(): boolean;

    // Inherited from TAbstractFile:
    name: string;
    parent: TFolder | null;   // null only for root
    path: string;             // "" for root, "folder/subfolder" otherwise
    vault: Vault;
}
```

### FileStats Interface

```typescript
export interface FileStats {
    /** Creation time as Unix timestamp in milliseconds. */
    ctime: number;

    /** Last modification time as Unix timestamp in milliseconds. */
    mtime: number;

    /** File size in bytes. */
    size: number;
}
```

### Type Checking

```typescript
import { TFile, TFolder, TAbstractFile } from 'obsidian';

const abstractFile = this.app.vault.getAbstractFileByPath('some/path');

if (abstractFile instanceof TFile) {
    console.log('File extension:', abstractFile.extension);
    console.log('File size:', abstractFile.stat.size);
}

if (abstractFile instanceof TFolder) {
    console.log('Number of children:', abstractFile.children.length);
    console.log('Is root:', abstractFile.isRoot());
}
```

---

## 10. MarkdownView

`MarkdownView` extends `TextFileView` (which extends `EditableFileView` > `FileView` > `ItemView` > `View`). It represents an open markdown document.

```typescript
export class MarkdownView extends TextFileView {
    /** The Editor instance for this view. */
    editor: Editor;

    /** The currently open file (inherited from FileView). */
    file: TFile | null;

    /** The preview/reading mode sub-view. */
    previewMode: MarkdownPreviewView;

    /** Returns the view type identifier: 'markdown'. */
    getViewType(): string;

    /**
     * Returns the current mode.
     * @returns 'source' or 'preview'
     */
    getMode(): MarkdownViewModeType;

    /** Returns the current content of the view as a string. */
    getViewData(): string;

    /**
     * Sets the view content.
     * @param data - The markdown content.
     * @param clear - If true, clears existing content before setting.
     */
    setViewData(data: string, clear: boolean): void;

    /** Clears the editor content. */
    clear(): void;

    /** Requests a save of the current content. */
    requestSave(): void;
}

type MarkdownViewModeType = 'source' | 'preview';
```

**Usage: Getting the active editor:**
```typescript
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
    const editor = view.editor;
    const content = editor.getValue();
    const file = view.file;
}
```

### ItemView (Base Class)

For custom non-markdown views, extend `ItemView`:

```typescript
export abstract class ItemView extends View {
    /** Must return a unique string identifier for this view type. */
    abstract getViewType(): string;

    /** Must return a human-readable display name. */
    abstract getDisplayText(): string;

    /** Return a Lucide icon name for the view tab. */
    getIcon(): IconName;

    /** The root container element. */
    containerEl: HTMLElement;

    /** The content area element (use this to build your UI). */
    contentEl: HTMLElement;

    /** Called when the view is opened. Build your UI here. */
    async onOpen(): Promise<void>;

    /** Called when the view is closed. Clean up here. */
    async onClose(): Promise<void>;
}
```

**Registering and opening a custom view:**
```typescript
// In onload():
this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf));

// Opening the view:
const leaf = this.app.workspace.getRightLeaf(false);
await leaf.setViewState({ type: VIEW_TYPE, active: true });
this.app.workspace.revealLeaf(leaf);
```

---

## 11. MarkdownPostProcessorContext

The context object passed to markdown post-processors.

```typescript
export interface MarkdownPostProcessorContext {
    /** Unique ID for the document being rendered. */
    docId: string;

    /** Path of the source markdown file. */
    sourcePath: string;

    /** The frontmatter of the document, or null/undefined if none. */
    frontmatter: any | null | undefined;

    /**
     * Adds a child component that will be unloaded when the
     * rendered section is removed from the DOM.
     */
    addChild(child: MarkdownRenderChild): void;

    /**
     * Returns information about the section of the source file
     * that produced the given HTML element.
     * @returns Object with { text, lineStart, lineEnd } or null.
     */
    getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export interface MarkdownSectionInformation {
    text: string;
    lineStart: number;
    lineEnd: number;
}
```

**Usage with `registerMarkdownPostProcessor`:**
```typescript
this.registerMarkdownPostProcessor((el, ctx) => {
    // Modify rendered HTML elements
    const headings = el.querySelectorAll('h1, h2, h3');
    headings.forEach(h => h.addClass('custom-heading'));

    // Access source info
    console.log('Source file:', ctx.sourcePath);
    console.log('Frontmatter:', ctx.frontmatter);
});
```

**Usage with `registerMarkdownCodeBlockProcessor`:**
```typescript
this.registerMarkdownCodeBlockProcessor('my-lang', async (source, el, ctx) => {
    el.empty();
    el.createEl('div', { text: `Processed: ${source}` });
});
```

### MarkdownRenderChild

Used with `ctx.addChild()` to manage lifecycle of dynamically added DOM components:

```typescript
export class MarkdownRenderChild extends Component {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement);
}
```

---

## 12. Supporting Types and Interfaces

### Pos and Loc (Document Positions)

Used in all cache types to track positions within source files.

```typescript
/** A location in a document (a single point). */
export interface Loc {
    /** Column number (0-indexed). */
    col: number;

    /** Line number (0-indexed). */
    line: number;

    /** Character offset from the beginning of the file. */
    offset: number;
}

/** A range in a document (start to end). */
export interface Pos {
    start: Loc;
    end: Loc;
}
```

### CacheItem

Base interface for all cached metadata items.

```typescript
export interface CacheItem {
    position: Pos;
}
```

### HeadingCache

```typescript
export interface HeadingCache extends CacheItem {
    /** The heading text (without the # symbols). */
    heading: string;

    /** Heading level: 1 through 6. */
    level: number;

    position: Pos;
}
```

### LinkCache

```typescript
export interface LinkCache extends ReferenceCache {
    /** Display text (if different from link target). */
    displayText?: string;

    /** The link destination (e.g., "My Note" or "folder/My Note"). */
    link: string;

    /** The original text as written in the source (e.g., "[[My Note|display]]"). */
    original: string;

    position: Pos;
}
```

### EmbedCache

```typescript
export interface EmbedCache extends ReferenceCache {
    /** Same structure as LinkCache -- for ![[embed]] syntax. */
    displayText?: string;
    link: string;
    original: string;
    position: Pos;
}
```

### TagCache

```typescript
export interface TagCache extends CacheItem {
    /** The tag including the # prefix (e.g., "#mytag"). */
    tag: string;

    position: Pos;
}
```

### SectionCache

```typescript
export interface SectionCache extends CacheItem {
    /** Optional block ID (for ^block-references). */
    id?: string;

    position: Pos;

    /** Section type. Known values include: */
    type: 'blockquote' | 'callout' | 'code' | 'element' | 'footnoteDefinition'
        | 'heading' | 'html' | 'list' | 'paragraph' | 'table' | 'text'
        | 'thematicBreak' | 'yaml' | string;
}
```

### ListItemCache

```typescript
export interface ListItemCache extends CacheItem {
    /** Block ID if this list item has a ^block-reference. */
    id?: string;

    /**
     * Line number of the parent list item.
     * Negative value = root-level (the value is -(first item's line number)).
     */
    parent: number;

    position: Pos;

    /**
     * Task checkbox status character.
     * ' ' = incomplete, 'x' = complete, any other char = custom status.
     * undefined = not a task item.
     */
    task?: string;
}
```

### BlockCache

```typescript
export interface BlockCache extends CacheItem {
    /** The block identifier (the text after ^). */
    id: string;

    position: Pos;
}
```

### FrontMatterCache

```typescript
/**
 * Represents parsed YAML frontmatter.
 * This is a plain object with string keys and arbitrary values.
 * As of v1.4.0, FrontMatterCache no longer extends CacheItem
 * (it does not have a position property).
 */
export interface FrontMatterCache extends Record<string, any> {
    // Dynamic keys from the YAML frontmatter
}
```

### ReferenceCache

```typescript
export interface ReferenceCache extends CacheItem {
    displayText?: string;
    link: string;
    original: string;
    position: Pos;
}
```

### DataWriteOptions

```typescript
export interface DataWriteOptions {
    /** Creation time override (Unix timestamp in ms). */
    ctime?: number;

    /** Modification time override (Unix timestamp in ms). */
    mtime?: number;
}
```

### OpenViewState

```typescript
export interface OpenViewState {
    /** Whether to focus the view. */
    active?: boolean;

    /** Editor state (cursor position, scroll, etc.). */
    eState?: any;

    /** Starting scroll position. */
    scroll?: number;

    /** Whether the view should be focused. */
    focus?: boolean;
}
```

### ViewState

```typescript
export interface ViewState {
    type: string;
    state?: any;
    active?: boolean;
    pinned?: boolean;
    group?: WorkspaceLeaf;
}
```

### PaneType

```typescript
type PaneType = 'tab' | 'split' | 'window';
```

### MarkdownFileInfo

```typescript
export interface MarkdownFileInfo {
    editor?: Editor;
    file?: TFile | null;
}
```

### App

The global application object, available as `this.app` in plugins.

```typescript
export class App {
    /** File operations API. */
    vault: Vault;

    /** Cached metadata for all files. */
    metadataCache: MetadataCache;

    /** Workspace layout and pane management. */
    workspace: Workspace;

    /** High-level file operations (rename with link updates, frontmatter). */
    fileManager: FileManager;

    /** The scope for hotkey management. */
    keymap: Keymap;

    /** The last known active file. */
    lastOpenFiles: string[];
}
```

### PluginManifest

```typescript
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    description: string;
    author: string;
    authorUrl?: string;
    isDesktopOnly?: boolean;
}
```

---

## Quick Reference: Common Patterns

### Reading and modifying a file safely

```typescript
// BEST: Use process() for atomic read-modify-write
await this.app.vault.process(file, (content) => {
    return content.replace('old', 'new');
});

// GOOD: Use read() + modify() when you need the content separately
const content = await this.app.vault.read(file);
await this.app.vault.modify(file, content + '\nAppended.');

// DISPLAY ONLY: Use cachedRead() when you just need to show content
const displayContent = await this.app.vault.cachedRead(file);
```

### Getting the current editor

```typescript
// Method 1: Via MarkdownView
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
    const editor = view.editor;
}

// Method 2: Via editorCallback command (editor is guaranteed)
this.addCommand({
    id: 'my-cmd',
    name: 'My Command',
    editorCallback: (editor: Editor, view: MarkdownView) => {
        editor.replaceSelection('inserted text');
    }
});
```

### Modifying frontmatter

```typescript
await this.app.fileManager.processFrontMatter(file, (fm) => {
    fm.tags = fm.tags || [];
    fm.tags.push('new-tag');
    fm.modified = new Date().toISOString();
});
```

### Finding backlinks

```typescript
const backlinks: string[] = [];
const resolved = this.app.metadataCache.resolvedLinks;
for (const [source, links] of Object.entries(resolved)) {
    if (links[targetFile.path]) {
        backlinks.push(source);
    }
}
```

### Creating and opening a new file

```typescript
const file = await this.app.vault.create('New Note.md', '# Title\n\nContent.');
const leaf = this.app.workspace.getLeaf('tab');
await leaf.openFile(file);
```

### Listening to events safely

```typescript
// Always use registerEvent() for auto-cleanup:
this.registerEvent(this.app.vault.on('modify', (file) => { /* ... */ }));
this.registerEvent(this.app.workspace.on('file-open', (file) => { /* ... */ }));
this.registerEvent(this.app.metadataCache.on('changed', (file, data, cache) => { /* ... */ }));

// DOM events:
this.registerDomEvent(document, 'click', (evt) => { /* ... */ });

// Intervals:
this.registerInterval(window.setInterval(() => { /* ... */ }, 60000));
```

---

*Generated from the official Obsidian API type definitions (`obsidian.d.ts`) and Obsidian developer documentation.*
*Source: https://github.com/obsidianmd/obsidian-api | https://docs.obsidian.md/Reference/TypeScript+API*
