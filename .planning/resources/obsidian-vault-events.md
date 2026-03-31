# Obsidian Vault & Events API Reference

> Scraped 2026-03-31 from official Obsidian developer docs and community resources.
> Focused on: Vault API, Events system, MetadataCache, Plugin lifecycle, and event dispatch.

---

## 1. Events Base Class

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Events

```typescript
export class Events
```

The `Events` class is the base event emitter used throughout Obsidian. Both `Vault`, `MetadataCache`, and `Workspace` extend it.

### Methods

| Method | Description |
|--------|-------------|
| `on(name: string, callback, ctx)` | Register an event listener. Returns `EventRef`. (since 0.9.7) |
| `off(name, callback)` | Unregister an event listener. (since 0.9.7) |
| `offref(ref)` | Unregister by EventRef. (since 0.9.7) |
| `trigger(name, ...data)` | Trigger an event by name. (since 0.9.7) |
| `tryTrigger(evt, args)` | Try to trigger an event. (since 0.9.7) |

### EventRef Interface

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/EventRef

```typescript
export interface EventRef
```

An opaque reference returned by `Events.on()`. Used with `offref()` and `Component.registerEvent()` for lifecycle-managed cleanup.

---

## 2. Component Class (Plugin base)

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Component

```typescript
export class Component
```

The `Component` class provides lifecycle management. `Plugin` extends `Component`.

### Key Methods

| Method | Description |
|--------|-------------|
| `onload()` | Override to load your component. (since 0.9.7) |
| `onunload()` | Override to unload your component. (since 0.9.7) |
| `load()` | Load this component and its children. (since 0.9.7) |
| `unload()` | Unload this component and its children. (since 0.9.7) |
| `addChild(component)` | Adds a child component, loading it if this component is loaded. (since 0.12.0) |
| `removeChild(component)` | Removes a child component, unloading it. (since 0.12.0) |
| `register(cb)` | Registers a callback to be called when unloading. (since 0.9.7) |
| `registerEvent(eventRef)` | **Registers an event to be detached when unloading.** (since 0.9.7) |
| `registerDomEvent(el, type, callback, options)` | Registers a DOM event to be detached when unloading. (since 0.14.8) |
| `registerInterval(id)` | Registers an interval (from setInterval) to be cancelled when unloading. (since 0.13.8) |

### registerEvent() Detail

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Component/registerEvent

```typescript
registerEvent(eventRef: EventRef): void;
```

Registers an event to be detached when unloading. This is the **primary mechanism** for safely subscribing to vault, workspace, and metadata events in a plugin.

**How it works internally:**
1. `vault.on('modify', callback)` returns an `EventRef`
2. `this.registerEvent(ref)` stores the ref in the Component's internal `_events` array
3. When `unload()` is called (plugin disable), all stored refs are passed to `offref()` automatically
4. This prevents memory leaks and stale event handlers

**Usage pattern:**
```typescript
this.registerEvent(this.app.vault.on('create', () => {
  console.log('a new file has entered the arena');
}));
```

---

## 3. Plugin Class

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Plugin

```typescript
export abstract class Plugin extends Component
```

### Lifecycle

| Method | Description |
|--------|-------------|
| `onload()` | Called when plugin is loaded. Register events, commands, views here. (since 0.9.7) |
| `onunload()` | Override to clean up. Inherited from Component. (since 0.9.7) |
| `onUserEnable()` | Called when user explicitly enables the plugin. Safe to open views. (since 1.7.2) |
| `onExternalSettingsChange()` | Called when data.json is modified externally (e.g., by Sync). (since 1.5.7) |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `app` | `App` | The Obsidian App instance |
| `manifest` | `PluginManifest` | Plugin manifest data |

### Key Inherited Methods (from Component)

- `registerEvent(eventRef)` -- register vault/workspace/cache events
- `registerEditorExtension(extension)` -- register CM6 extensions
- `registerInterval(id)` -- register auto-cleared intervals
- `addChild(component)` -- manage child component lifecycle
- `register(cb)` -- register cleanup callback

---

## 4. Vault Class

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Vault

```typescript
export class Vault extends Events
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `adapter` | `DataAdapter` | Low-level file system adapter. (since 0.9.7) |
| `configDir` | `string` | Path to config folder (typically `.obsidian`). (since 0.11.1) |

### File Read Methods

| Method | Description |
|--------|-------------|
| `read(file)` | Read plaintext file from disk. Use when you intend to modify content afterwards. (since 0.9.7) |
| `cachedRead(file)` | Read from cache. Use for display only. (since 0.9.7) |
| `readBinary(file)` | Read binary file content. (since 0.9.7) |

**Important:** The only difference between `cachedRead()` and `read()` is when the file was modified outside of Obsidian just before the plugin reads it. As soon as the file system notifies Obsidian that the file has changed from the outside, `cachedRead()` behaves exactly like `read()`. Similarly, if you save the file within Obsidian, the read cache is flushed as well.

### File Write Methods

| Method | Description | Triggers Event? |
|--------|-------------|----------------|
| `create(path, data, options)` | Create a new plaintext file. | `'create'` event |
| `createBinary(path, data, options)` | Create a new binary file. | `'create'` event |
| `modify(file, data, options)` | Modify contents of a plaintext file. | `'modify'` event |
| `modifyBinary(file, data, options)` | Modify contents of a binary file. | `'modify'` event |
| `append(file, data, options)` | Add text to end of file. | `'modify'` event |
| `appendBinary(file, data, options)` | Add data to end of binary file. | `'modify'` event |
| `process(file, fn, options)` | **Atomically** read, modify, and save. | `'modify'` event |
| `delete(file, force)` | Delete file completely. | `'delete'` event |
| `trash(file, system)` | Move to trash. | `'delete'` event |
| `rename(file, newPath)` | Rename or move a file. | `'rename'` event |
| `copy(file, newPath)` | Copy a file or folder. | `'create'` event |
| `createFolder(path)` | Create a new folder. | `'create'` event |

### File Lookup Methods

| Method | Description |
|--------|-------------|
| `getAbstractFileByPath(path)` | Get file or folder. Use `instanceof TFile` / `instanceof TFolder` to check type. |
| `getFileByPath(path)` | Get a file. Returns `null` if not found. |
| `getFolderByPath(path)` | Get a folder. Returns `null` if not found. |
| `getFiles()` | Get all files in the vault. (since 0.9.7) |
| `getMarkdownFiles()` | Get all Markdown files. (since 0.9.7) |
| `getAllLoadedFiles()` | Get all files and folders. (since 0.9.7) |
| `getAllFolders(includeRoot)` | Get all folders. |
| `getRoot()` | Get root folder. (since 0.9.7) |
| `getName()` | Get vault name. (since 0.9.7) |
| `getResourcePath(file)` | Get URI for browser engine (e.g., image embeds). (since 0.9.7) |
| `recurseChildren(root, cb)` | Static. Recursively iterate children. (since 0.9.7) |

---

## 5. Vault Events

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Vault

### `vault.on('create')`

Called when a file is created. **Also called when the vault is first loaded for each existing file.** If you do not wish to receive create events on vault load, register your event handler inside `Workspace.onLayoutReady()`. (since 0.9.7)

```typescript
vault.on('create', (file: TAbstractFile) => void): EventRef;
```

### `vault.on('modify')`

Called when a file is modified. (since 0.9.7)

```typescript
vault.on('modify', (file: TAbstractFile) => void): EventRef;
```

### `vault.on('delete')`

Called when a file is deleted. (since 0.9.7)

```typescript
vault.on('delete', (file: TAbstractFile) => void): EventRef;
```

### `vault.on('rename')`

Called when a file is renamed. (since 0.9.7)

```typescript
vault.on('rename', (file: TAbstractFile, oldPath: string) => void): EventRef;
```

### Which Methods Trigger Which Events

| Vault Method | Event Fired |
|-------------|-------------|
| `create()` | `'create'` |
| `createBinary()` | `'create'` |
| `createFolder()` | `'create'` |
| `copy()` | `'create'` |
| `modify()` | `'modify'` |
| `modifyBinary()` | `'modify'` |
| `append()` | `'modify'` |
| `appendBinary()` | `'modify'` |
| `process()` | `'modify'` (internally calls read then modify) |
| `delete()` | `'delete'` |
| `trash()` | `'delete'` |
| `rename()` | `'rename'` |

### Important Notes on Vault Events

- **Vault events fire for ALL file types**, not just markdown. Use `file instanceof TFile` or check `file.extension` to filter.
- The `'create'` event fires for every existing file when the vault first loads. To avoid this, register inside `Workspace.onLayoutReady()`.
- Events fire **synchronously** after the operation completes.
- External file system changes (e.g., from Sync or other apps) also trigger vault events once Obsidian detects the change.

---

## 6. Vault.process() -- Atomic File Modification

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Vault/process

```typescript
process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
```

Atomically read, modify, and save the contents of a note. (since 1.1.0)

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | `TFile` | The file to be read and modified. |
| `fn` | `(data: string) => string` | A callback that returns the new content **synchronously**. |
| `options` | `DataWriteOptions` | (Optional) write options. |

**Returns:** `Promise<string>` -- the text value of the note that was written.

### Example

```typescript
app.vault.process(file, (data) => {
  return data.replace('Hello', 'World');
});
```

### Key Behavior

- `process()` is an abstraction on top of `read()` and `modify()` that guarantees the file doesn't change between reading and writing.
- **Always prefer `process()` over `read()`/`modify()` to avoid unintentional data loss.**
- The callback `fn` must be **synchronous**. For async modifications, use this pattern:
  1. Read file with `cachedRead()`
  2. Perform async operations
  3. Update with `process()`, checking `data` matches what `cachedRead()` returned

### Vault.process() vs Vault.modify()

From the Plugin Guidelines:

- **Use `process()` for background file modification** -- it is atomic and prevents race conditions.
- **Use the Editor API for modifying the active file** -- this preserves undo history.
- **Use `FileManager.processFrontMatter()` for frontmatter changes.**

---

## 7. MetadataCache Class

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache

```typescript
export class MetadataCache extends Events
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `resolvedLinks` | `Record<string, Record<string, number>>` | Maps source file path to destination file paths with link count. All vault absolute paths. |
| `unresolvedLinks` | `Record<string, Record<string, number>>` | Maps source file path to unknown destinations with count. |

### Methods

| Method | Description |
|--------|-------------|
| `getFileCache(file)` | Get cached metadata for a file. (since 0.9.21) |
| `getCache(path)` | Get cached metadata by path. (since 0.14.5) |
| `getFirstLinkpathDest(linkpath, sourcePath)` | Get best match for a linkpath. (since 0.12.5) |
| `fileToLinktext(file, sourcePath, omitMdExtension)` | Generate linktext for a file. Uses filename if unique, full path otherwise. |

### MetadataCache Events

#### `metadataCache.on('changed')`

Called when a file has been indexed and its (updated) cache is now available.

```typescript
metadataCache.on('changed', (file: TFile, data: string, cache: CachedMetadata) => void): EventRef;
```

**Note:** This is NOT called when a file is renamed (for performance reasons). You must hook the vault `'rename'` event for those.

**Important:** The `'changed'` event is emitted **asynchronously** after a file is modified. Do not rely on immediate metadata updates after calling `vault.modify()` or `vault.process()`.

#### `metadataCache.on('deleted')`

Called when a file has been deleted. A best-effort previous version of the cached metadata is presented, but it could be null.

```typescript
metadataCache.on('deleted', (file: TFile, prevCache: CachedMetadata | null) => void): EventRef;
```

#### `metadataCache.on('resolve')`

Called when a file has been resolved for `resolvedLinks` and `unresolvedLinks`. This happens sometime after a file has been indexed.

```typescript
metadataCache.on('resolve', (file: TFile) => void): EventRef;
```

#### `metadataCache.on('resolved')`

Called when ALL files have been resolved. Fired each time files get modified after the initial load.

```typescript
metadataCache.on('resolved', () => void): EventRef;
```

---

## 8. Event Dispatch Lifecycle

### File Modification Flow

When a file is modified (e.g., via `vault.process()` or `vault.modify()`):

1. **Vault write** -- The file content is written to disk via the adapter.
2. **`vault 'modify'` event fires** -- Synchronously after the write completes. Callback receives `TAbstractFile`.
3. **MetadataCache re-indexes** -- Obsidian asynchronously parses the file for links, headings, tags, frontmatter, etc.
4. **`metadataCache 'changed'` event fires** -- Once indexing is complete. Provides the file, raw data, and new `CachedMetadata`.
5. **Link resolution** -- Obsidian resolves links across the vault.
6. **`metadataCache 'resolve'` event fires** -- For the specific file.
7. **`metadataCache 'resolved'` event fires** -- Once all pending files are resolved.

### File Creation Flow

1. **File created on disk**
2. **`vault 'create'` event fires**
3. **MetadataCache indexes** the new file
4. **`metadataCache 'changed'` fires**
5. **`metadataCache 'resolve'` fires**
6. **`metadataCache 'resolved'` fires**

### File Deletion Flow

1. **File deleted from disk**
2. **`vault 'delete'` event fires** -- callback receives `TAbstractFile`
3. **`metadataCache 'deleted'` fires** -- with best-effort previous cache

### File Rename Flow

1. **File renamed on disk**
2. **`vault 'rename'` event fires** -- callback receives `(file, oldPath)`
3. **`metadataCache 'changed'` does NOT fire** for renames (performance)
4. **Link resolution updates** -- resolved/unresolved links are recalculated
5. **`metadataCache 'resolved'` fires**

### Startup / Vault Load Flow

1. Vault loads all files from disk
2. **`vault 'create'` fires for EVERY existing file** -- this is why you should register create handlers inside `Workspace.onLayoutReady()` if you only want new files
3. MetadataCache indexes all files
4. **`metadataCache 'resolved'` fires** once all files are indexed and links resolved

---

## 9. Event Registration Best Practices

**Sources:**
- https://docs.obsidian.md/Plugins/Events
- https://www.mintlify.com/obsidianmd/obsidian-api/concepts/events
- https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

### Always Use registerEvent()

```typescript
// CORRECT -- auto-cleanup on plugin unload
this.registerEvent(this.app.vault.on('modify', (file) => { ... }));

// WRONG -- memory leak, stale handler after disable
this.app.vault.on('modify', (file) => { ... });
```

### Filter Early

Vault events fire for ALL file types (folders, images, etc.):

```typescript
this.registerEvent(
  this.app.vault.on('modify', (file) => {
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    // Process markdown file only
  })
);
```

### Debounce Frequent Events

The `'modify'` event fires on every keystroke in the editor. Use debouncing:

```typescript
import { debounce } from 'obsidian';

const debouncedHandler = debounce(
  (file: TFile) => { /* process */ },
  1000,
  true  // reset timer on each call
);

this.registerEvent(
  this.app.vault.on('modify', (file) => {
    if (file instanceof TFile) debouncedHandler(file);
  })
);
```

### Avoid Create Events on Startup

```typescript
this.app.workspace.onLayoutReady(() => {
  this.registerEvent(
    this.app.vault.on('create', (file) => {
      // Only fires for genuinely new files, not vault load
    })
  );
});
```

### Prefer process() Over modify()

From Plugin Guidelines:

- **Use `Vault.process()` instead of `Vault.modify()`** for background file modifications -- it is atomic.
- **Use the Editor API** (not `Vault.modify()`) for changes to the currently active file to preserve undo history.
- **Use `FileManager.processFrontMatter()`** for frontmatter-only changes.
- **Prefer the Vault API over the Adapter API** (`app.vault.adapter`). The Adapter API should only be used for files outside the vault or hidden files.

### Custom Events

You can create your own event emitter by extending `Events`:

```typescript
import { Events } from 'obsidian';

class MyEvents extends Events {
  on(name: 'my-event', callback: (data: string) => any): EventRef;
  on(name: string, callback: (...data: any) => any): EventRef {
    return super.on(name, callback);
  }
}

// Usage
const events = new MyEvents();
this.registerEvent(events.on('my-event', (data) => { ... }));
events.trigger('my-event', 'payload');
```

---

## 10. Workspace.onLayoutReady()

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/Workspace/onLayoutReady

Called when the workspace layout is fully loaded. Use this to defer event registration that should not fire during vault initialization.

```typescript
this.app.workspace.onLayoutReady(() => {
  // Safe to register events that shouldn't fire on startup
  this.registerEvent(this.app.vault.on('create', ...));
});
```

---

## 11. DataWriteOptions

**Source:** https://docs.obsidian.md/Reference/TypeScript+API/DataWriteOptions

Optional options passed to `vault.modify()`, `vault.process()`, `vault.create()`, etc.:

```typescript
interface DataWriteOptions {
  ctime?: number;  // Creation time override
  mtime?: number;  // Modification time override
}
```

---

## 12. Plugin Guidelines (Vault Section)

**Source:** https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

Key guidelines for vault operations:

1. **Prefer Editor API over `Vault.modify` for the active file** -- preserves undo history.
2. **Prefer `Vault.process` over `Vault.modify` for background modifications** -- atomic, prevents data loss.
3. **Prefer `FileManager.processFrontMatter` for frontmatter** -- handles YAML parsing correctly.
4. **Prefer the Vault API over the Adapter API** -- the Adapter bypasses Obsidian's file tracking.
5. **Avoid iterating all files to find a file by path** -- use `vault.getFileByPath()` or `vault.getAbstractFileByPath()`.
6. **Use `normalizePath()`** to clean up user-defined paths.
7. **Clean up resources when plugin unloads** -- always use `registerEvent()`, `registerInterval()`, etc.
8. **Don't detach leaves in `onunload`** -- Obsidian handles this.
