# Obsidian Plugin Development: Gotchas, Pitfalls, and Common Mistakes

A comprehensive offline reference covering the most common (and most painful) mistakes in Obsidian plugin development, with explanations, root causes, and fixes.

---

## Table of Contents

1. [Main Thread Blocking](#1-main-thread-blocking)
2. [Memory Leaks](#2-memory-leaks)
3. [Race Conditions](#3-race-conditions)
4. [Mobile vs Desktop Differences](#4-mobile-vs-desktop-differences)
5. [MetadataCache Timing](#5-metadatacache-timing)
6. [Vault.modify vs Vault.process](#6-vaultmodify-vs-vaultprocess)
7. [Adapter API Pitfalls](#7-adapter-api-pitfalls)
8. [Plugin Loading Order](#8-plugin-loading-order)
9. [Hot Reload Issues](#9-hot-reload-issues)
10. [CSS Conflicts](#10-css-conflicts)
11. [Electron/Node.js Version Constraints](#11-electronnodejs-version-constraints)
12. [File Path Issues](#12-file-path-issues)
13. [Frontmatter Parsing Edge Cases](#13-frontmatter-parsing-edge-cases)
14. [Large Vault Performance](#14-large-vault-performance)
15. [Settings Migration](#15-settings-migration)
16. [Obsidian API Breaking Changes](#16-obsidian-api-breaking-changes)
17. [TypeScript/Build Pipeline Issues](#17-typescriptbuild-pipeline-issues)
18. [The data.json File](#18-the-datajson-file)
19. [Workspace Serialization Gotchas](#19-workspace-serialization-gotchas)
20. [Canvas and Non-Markdown File Handling](#20-canvas-and-non-markdown-file-handling)

---

## 1. Main Thread Blocking

### The Problem

Obsidian runs in a single-threaded Electron/Capacitor environment. Any CPU-intensive work in your plugin (parsing large files, complex computations, heavy DOM manipulation) blocks the main thread. This freezes the entire UI -- the editor stops responding, scrolling halts, and typing lags by seconds.

Developers have reported that code running ~5ms per page in standalone Node.js takes ~30-50ms per page inside Obsidian due to the shared main thread overhead.

### Why It Happens

Obsidian plugins share the same JavaScript thread as the editor, renderer, and all other plugins. There is no isolation. A tight loop or synchronous computation starves the event loop.

### Web Workers Limitations

Web Workers are the natural solution, but Obsidian's environment makes them difficult:

- **`Worker` constructor may not work**: Some Obsidian versions throw `"Worker is not a constructor"`. The availability depends on Obsidian version and platform.
- **No direct Obsidian API access**: Web Workers cannot call `app.vault`, `app.workspace`, etc. You must use `postMessage` to communicate back to the main thread.
- **Build complexity**: You need an esbuild plugin (like `esbuild-plugin-inline-worker`) to bundle worker code inline, since Obsidian plugins must ship as a single `main.js` file.
- **Mobile limitations**: Capacitor-based mobile apps may have further restrictions on Web Worker support.

### How to Avoid/Fix

```typescript
// BAD: Synchronous processing of many files
for (const file of vault.getMarkdownFiles()) {
  const content = await vault.read(file);
  heavyProcessing(content); // Blocks UI for each file
}

// BETTER: Yield to the event loop between iterations
async function processFilesInBatches(files: TFile[], batchSize = 50) {
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    for (const file of batch) {
      const content = await vault.read(file);
      heavyProcessing(content);
    }
    // Yield to the event loop so the UI can update
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// BEST: Use a Web Worker for truly heavy computation (when supported)
// See: https://github.com/RyotaUshio/obsidian-web-worker-example
```

**Key strategies:**
- Break work into small chunks with `setTimeout(resolve, 0)` between batches.
- Debounce event handlers so rapid-fire events (typing, scrolling) don't stack up processing.
- Defer non-critical work to `requestIdleCallback` (available in Electron's Chromium).
- Use `workspace.onLayoutReady()` to defer startup work (see MetadataCache section).

---

## 2. Memory Leaks

### The Problem

Plugins that don't properly clean up event listeners, intervals, DOM elements, or references cause Obsidian's memory usage to grow unboundedly. This is especially harmful because users rarely restart Obsidian, and hot-reloading during development compounds the issue -- each reload adds another layer of leaked listeners.

### Why It Happens

JavaScript's garbage collector cannot reclaim objects that are still referenced. An event listener registered on `app.vault` holds a reference to your callback (and via closure, potentially to large data structures). If the plugin is unloaded but the listener remains, both the callback and its closure stay in memory.

### Common Leak Sources

**1. Bare event listeners (not using `registerEvent`)**:
```typescript
// BAD: This listener will survive plugin unload
onload() {
  this.app.vault.on('modify', this.handleModify.bind(this));
}

// GOOD: registerEvent automatically detaches on unload
onload() {
  this.registerEvent(
    this.app.vault.on('modify', (file) => {
      // handle modification
    })
  );
}
```

**2. Bare DOM event listeners (not using `registerDomEvent`)**:
```typescript
// BAD: Leaks on every hot-reload cycle
onload() {
  document.addEventListener('click', this.handleClick);
}

// GOOD: Automatically removed on unload
onload() {
  this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    // handle click
  });
}
```

**3. Bare intervals (not using `registerInterval`)**:
```typescript
// BAD: Interval continues after plugin unload
onload() {
  setInterval(() => this.doWork(), 5000);
}

// GOOD: Automatically cleared on unload
// NOTE: Use window.setInterval, not setInterval, for correct TypeScript typing
onload() {
  this.registerInterval(
    window.setInterval(() => this.doWork(), 5000)
  );
}
```

**4. Stale DOM references**:
```typescript
// BAD: Holding a reference to a DOM element that may be removed
class MyPlugin extends Plugin {
  private statusBarEl: HTMLElement;

  onload() {
    this.statusBarEl = this.addStatusBarItem();
    // If you also store references to child elements and
    // the status bar item is removed, the children leak.
  }
}
```

**5. Mutation Observers and Resize Observers**:
```typescript
// BAD: Observer continues after unload
onload() {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { childList: true });
}

// GOOD: Disconnect in onunload
onload() {
  this.observer = new MutationObserver(callback);
  this.observer.observe(document.body, { childList: true });
}

onunload() {
  this.observer?.disconnect();
}
```

### How to Avoid/Fix

- **Always** use `this.registerEvent()`, `this.registerDomEvent()`, and `this.registerInterval()`. These are automatically cleaned up.
- Use `this.register()` for custom cleanup callbacks:
  ```typescript
  onload() {
    const handler = someExternalLibrary.subscribe(callback);
    this.register(() => handler.unsubscribe());
  }
  ```
- Implement `onunload()` for anything that cannot be registered.
- Test with hot-reload: enable, disable, re-enable your plugin repeatedly and watch memory in DevTools.
- In Chrome DevTools (accessible via Ctrl+Shift+I in Obsidian), take heap snapshots before/after plugin disable to identify retained objects.

---

## 3. Race Conditions

### The Problem

Multiple race conditions can occur with file operations, metadata cache updates, and concurrent plugin operations. The most common scenarios:
- Two plugins modify the same file simultaneously and one overwrites the other's changes.
- Reading a file, computing new content asynchronously, then writing back -- but the file changed in between.
- Accessing metadata cache before it's ready.

### Why It Happens

`Vault.modify()` is not transactional. It replaces the entire file content. If another operation (another plugin, Obsidian itself, or sync) modifies the file between your read and your write, those changes are lost.

### The `requestSave` Debounce Problem

Neither `vault.process()` nor `vault.modify()` work reliably when there is a `requestSave` debounce event in progress. If your plugin tries to modify a file within ~2 seconds of the user editing it in the editor, the modification may silently fail or be overwritten by the editor's pending save.

### Examples and Fixes

**Race condition with `vault.modify()`**:
```typescript
// BAD: Race condition between read and write
async appendToFile(file: TFile, text: string) {
  const content = await this.app.vault.read(file);
  // Another plugin could modify the file RIGHT HERE
  await this.app.vault.modify(file, content + '\n' + text);
  // The other plugin's changes are now lost
}

// BETTER: Use vault.process() for atomic read-modify-write
async appendToFile(file: TFile, text: string) {
  await this.app.vault.process(file, (content) => {
    return content + '\n' + text;
    // NOTE: The callback MUST be synchronous.
    // You cannot await anything inside this callback.
  });
}
```

**The synchronous limitation of `vault.process()`**:
```typescript
// THIS DOES NOT WORK -- process() requires a synchronous callback
await this.app.vault.process(file, async (content) => {
  const result = await someAsyncOperation(content); // NOT ALLOWED
  return result;
});

// WORKAROUND: Do async work first, then use process()
const externalData = await fetchSomething();
await this.app.vault.process(file, (content) => {
  return content.replace('PLACEHOLDER', externalData);
});
```

**File creation event race condition**:
```typescript
// BAD: Another handler may modify the file between creation and your modification
this.registerEvent(this.app.vault.on('create', async (file) => {
  if (file instanceof TFile) {
    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, content + '\nAppended by my plugin');
    // Another plugin's 'create' handler may have also modified it
  }
}));
```

### How to Avoid/Fix

- Prefer `vault.process()` over `vault.modify()` when you need to transform existing content.
- Accept that `vault.process()` is synchronous-only. Do async work before calling it.
- When modifying files that the user is currently editing, consider using the Editor API instead of Vault API.
- Add a small delay or check `app.workspace.getActiveFile()` to avoid conflicting with the editor's `requestSave` debounce.
- For cross-plugin coordination, there is no built-in locking mechanism. You can use Obsidian's event system to coordinate, but it's best-effort.

---

## 4. Mobile vs Desktop Differences

### The Problem

Desktop Obsidian runs on Electron (Chromium + Node.js). Mobile Obsidian runs on Capacitor (a native WebView wrapper). This means:

- **Node.js APIs are unavailable on mobile**: `require('fs')`, `require('path')`, `require('child_process')`, `require('crypto')` -- all will crash.
- **Electron APIs are unavailable on mobile**: `require('electron')`, `remote`, `BrowserWindow`, etc.
- **`getBasePath()` is not available on mobile**: The adapter on mobile does not expose the same filesystem methods.
- **Performance is much worse on mobile**: Less RAM, slower CPU, battery constraints.
- **Screen size**: UI must be responsive; modals and sidebars may not fit.
- **Touch events vs mouse events**: Right-click menus, hover states, and drag-and-drop work differently.

### Why It Happens

Mobile Obsidian uses Capacitor (Ionic) instead of Electron. Capacitor provides a native WebView without Node.js integration. The mobile vault adapter has a different interface than the desktop `NodeFileSystemAdapter`.

### How to Avoid/Fix

**Set `isDesktopOnly` if you need Node.js**:
```json
// manifest.json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "isDesktopOnly": true
}
```

**Platform detection for conditional features**:
```typescript
import { Platform } from 'obsidian';

if (Platform.isDesktop) {
  // Safe to use Node.js APIs here
  const fs = require('fs');
}

if (Platform.isMobile) {
  // Use Obsidian Vault API instead of Node.js fs
}

if (Platform.isIosApp) {
  // iOS-specific workarounds
}

if (Platform.isAndroidApp) {
  // Android-specific workarounds
}
```

**Avoid direct filesystem access**:
```typescript
// BAD: Crashes on mobile
const fs = require('fs');
const content = fs.readFileSync('/path/to/file', 'utf8');

// GOOD: Works everywhere
const content = await this.app.vault.adapter.read('relative/path.md');

// BEST: Use Vault API (see Adapter section)
const file = this.app.vault.getAbstractFileByPath('relative/path.md');
if (file instanceof TFile) {
  const content = await this.app.vault.read(file);
}
```

**Mobile adapter interface changes**: The mobile adapter's interface has been known to change between Obsidian versions. Methods like `readFileSync` or `writeFileSync` on `app.vault.adapter.fs` are not available on mobile. Always code against the documented Vault API rather than the adapter internals.

---

## 5. MetadataCache Timing

### The Problem

`app.metadataCache` is not immediately populated on startup. If your plugin tries to read cached metadata (frontmatter, links, tags) during `onload()`, it will get incomplete or `null` results. The cache is built asynchronously as Obsidian indexes all vault files.

### Why It Happens

When Obsidian starts, it scans every file in the vault and parses metadata. This is async. The `'resolved'` event on MetadataCache fires after all files have been initially processed. Vault events (`create`, `modify`, `delete`) also fire during this indexing phase, which means your event handlers will trigger for every file in the vault on startup.

### The Event Sequence

1. `onload()` is called
2. Vault events fire for every file during indexing (including `'create'` for every existing file)
3. MetadataCache `'changed'` fires per file as each is parsed
4. MetadataCache `'resolve'` fires per file as links are resolved
5. MetadataCache `'resolved'` fires once all files are done
6. `workspace.onLayoutReady()` fires when the workspace layout is ready

### How to Avoid/Fix

**Guard vault event handlers during startup**:
```typescript
// APPROACH 1: Check layoutReady in the handler
onload() {
  this.registerEvent(this.app.vault.on('create', (file) => {
    if (!this.app.workspace.layoutReady) {
      return; // Ignore events during initial indexing
    }
    // Handle actual user-created files
  }));
}

// APPROACH 2: Register events after layout is ready
onload() {
  this.app.workspace.onLayoutReady(() => {
    this.registerEvent(this.app.vault.on('create', (file) => {
      // Only fires for files created after startup
    }));
  });
}
```

**Wait for MetadataCache to be fully resolved**:
```typescript
onload() {
  // Wait for all metadata to be indexed
  this.app.metadataCache.on('resolved', () => {
    // Now safe to query metadata for any file
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      const cache = this.app.metadataCache.getFileCache(file);
      // cache is now reliable
    }
  });
}
```

**Pitfall: `getFileCache` returns stale data**:
```typescript
// After modifying a file, the cache is NOT instantly updated
await this.app.vault.modify(file, newContent);
const cache = this.app.metadataCache.getFileCache(file);
// cache may still contain OLD metadata!

// FIX: Listen for the 'changed' event
this.registerEvent(
  this.app.metadataCache.on('changed', (changedFile) => {
    if (changedFile.path === file.path) {
      const cache = this.app.metadataCache.getFileCache(changedFile);
      // NOW it's up to date
    }
  })
);
```

**Pitfall: `'resolved'` fires multiple times**:
The `'resolved'` event fires after the initial load AND again each time files are subsequently modified. Don't use it as a one-time "startup complete" signal unless you unregister after the first call:
```typescript
onload() {
  const ref = this.app.metadataCache.on('resolved', () => {
    this.app.metadataCache.offref(ref);
    this.onCacheReady();
  });
  this.registerEvent(ref);
}
```

---

## 6. Vault.modify vs Vault.process

### The Problem

`Vault.modify(file, newContent)` replaces the entire file content. `Vault.process(file, fn)` reads the current content, passes it to a synchronous function, and writes the result atomically. Using the wrong one causes data loss.

### When `modify` Fails

- **Race condition**: If the file is modified between your read and your `modify()` call, you overwrite those changes.
- **Editor conflict**: If the user is actively editing the file, `modify()` fights with the editor's `requestSave` debounce. Calling `modify()` within ~2 seconds of an editor change may result in the modification being silently lost or overwritten.
- **Full replacement**: You must provide the complete new content. If you only want to change one line, you still need to read the whole file, modify the string, and write it all back.

### When `process` Fails

- **Synchronous only**: The callback passed to `process()` must be synchronous. If you need to `await` something (an API call, another file read), you cannot do it inside the callback.
- **Same `requestSave` issue**: `process()` is also affected by the editor's pending save debounce.
- **Not available for binary files**: Only works with text-based files.

### How to Choose

```typescript
// Use modify() when you have the complete new content already
// and are not concerned about concurrent modifications
await vault.modify(file, entireNewContent);

// Use process() when you need to transform existing content atomically
// and your transformation is synchronous
await vault.process(file, (data) => {
  return data.replace(/old/g, 'new');
});

// For the active editor, use the Editor API instead of either
const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
if (editor) {
  // This works WITH the editor, not against it
  editor.replaceRange('new text', { line: 0, ch: 0 }, { line: 0, ch: 5 });
}
```

### The `requestSave` Debounce Workaround

```typescript
// When modifying a file that's currently open in the editor,
// consider using the Editor API instead:
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view && view.file?.path === targetFile.path) {
  // Use Editor API -- cooperates with the editor's save cycle
  const editor = view.editor;
  const content = editor.getValue();
  editor.setValue(content.replace('old', 'new'));
} else {
  // File is not in the active editor, safe to use Vault API
  await this.app.vault.process(targetFile, (data) => {
    return data.replace('old', 'new');
  });
}
```

---

## 7. Adapter API Pitfalls

### The Problem

`app.vault.adapter` provides low-level filesystem access. Developers sometimes use it when the higher-level Vault API would be better. The adapter has several problems:

- **Interface changes on mobile**: The mobile adapter (`CapacitorAdapter`) has a different interface from the desktop adapter (`NodeFileSystemAdapter`). Methods like `getBasePath()`, `fs.readFileSync`, and `fs.writeFileSync` are desktop-only.
- **Bypasses Obsidian's event system**: Writing through the adapter doesn't trigger vault events (`create`, `modify`, `delete`), so other plugins and Obsidian itself don't know the file changed.
- **Bypasses caching**: Changes made through the adapter don't update MetadataCache.
- **Path handling differences**: The adapter deals with filesystem paths, not vault-relative paths.

### Why It Happens

The adapter is the low-level I/O layer. The Vault API is a higher-level abstraction that adds events, caching, and cross-platform compatibility on top of the adapter.

### How to Avoid/Fix

```typescript
// BAD: Using adapter directly for vault files
const content = await this.app.vault.adapter.read('notes/my-note.md');
await this.app.vault.adapter.write('notes/my-note.md', newContent);
// Other plugins don't know the file changed!

// GOOD: Use Vault API
const file = this.app.vault.getAbstractFileByPath('notes/my-note.md');
if (file instanceof TFile) {
  const content = await this.app.vault.read(file);
  await this.app.vault.modify(file, newContent);
  // Triggers 'modify' event, updates cache
}
```

**When adapter IS appropriate**:
- Reading/writing files outside the vault (e.g., config files)
- Working with binary data that the Vault API doesn't handle
- Checking file existence with `adapter.exists(path)`
- Working with the `.obsidian` directory

```typescript
// Adapter is fine for non-vault files or config
const configPath = `${this.app.vault.configDir}/plugins/my-plugin/cache.json`;
if (await this.app.vault.adapter.exists(configPath)) {
  const data = await this.app.vault.adapter.read(configPath);
}
```

**Avoid `getBasePath()`**:
```typescript
// BAD: Crashes on mobile
const basePath = (this.app.vault.adapter as any).getBasePath();

// GOOD: Use vault-relative paths with the Vault API
// If you absolutely need the base path, guard it:
if (Platform.isDesktop) {
  const adapter = this.app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    const basePath = adapter.getBasePath();
  }
}
```

---

## 8. Plugin Loading Order

### The Problem

There is no guaranteed loading order for community plugins. If your plugin depends on another plugin's API or registered views, you cannot assume it has loaded before yours. There is also no formal dependency declaration mechanism in the manifest.

### Why It Happens

Obsidian loads enabled plugins in an undefined order. The `onload()` calls are not sequenced based on dependencies.

### How to Avoid/Fix

**Check for other plugins at runtime, not at load time**:
```typescript
onload() {
  // BAD: The other plugin may not be loaded yet
  const dataview = this.app.plugins.plugins['dataview'];
  if (dataview) { /* ... */ } // May be undefined!

  // BETTER: Check when the feature is actually needed
  this.addCommand({
    id: 'use-dataview',
    name: 'Query with Dataview',
    callback: () => {
      const dv = this.app.plugins.plugins['dataview'];
      if (!dv?.api) {
        new Notice('Dataview plugin is not installed or enabled.');
        return;
      }
      // Use dv.api here
    },
  });
}
```

**Wait for layout ready + periodic check**:
```typescript
onload() {
  this.app.workspace.onLayoutReady(() => {
    this.checkDependency();
  });
}

checkDependency() {
  const dep = this.app.plugins.plugins['required-plugin'];
  if (dep) {
    this.initWithDependency(dep);
  } else {
    // Plugin might load later -- there's no event for "plugin loaded"
    // Gracefully degrade
    console.warn('Required plugin not available');
  }
}
```

**Communicate via Obsidian events**:
```typescript
// Plugin A: Broadcast readiness
onload() {
  this.app.workspace.onLayoutReady(() => {
    this.app.workspace.trigger('my-plugin:ready', this.api);
  });
}

// Plugin B: Listen for Plugin A
onload() {
  this.registerEvent(
    this.app.workspace.on('my-plugin:ready' as any, (api: any) => {
      this.usePluginAApi(api);
    })
  );
}
```

**Important**: The `app.plugins.plugins` object is not part of the official API. It may change without notice. Use it defensively.

---

## 9. Hot Reload Issues

### The Problem

During development, the hot-reload plugin (pjeby/hot-reload) disables and re-enables your plugin when `main.js` changes. If your `onunload()` doesn't clean up everything, you get:

- Duplicate event handlers (each reload adds another)
- Duplicate UI elements (ribbon icons, status bar items, sidebar views)
- Stale state (old data structures from the previous load)
- CSS conflicts (old styles linger)
- Memory growth (each reload leaks more)

### Why It Happens

Hot reload calls `plugin.unload()` (which calls `onunload()`) and then re-loads the new `main.js`. Anything not properly cleaned up in `onunload()` persists.

### How to Avoid/Fix

**Use `registerX()` methods for automatic cleanup** -- they handle `onunload()` for you:
- `this.registerEvent()` -- event listeners
- `this.registerDomEvent()` -- DOM event listeners
- `this.registerInterval()` -- intervals (use `window.setInterval`)
- `this.register()` -- custom cleanup callbacks
- `this.addCommand()` -- commands (auto-removed)
- `this.addRibbonIcon()` -- ribbon icons (auto-removed)
- `this.addStatusBarItem()` -- status bar items (auto-removed)
- `this.addSettingTab()` -- setting tabs (auto-removed)
- `this.registerView()` -- custom views (auto-removed)
- `this.registerMarkdownPostProcessor()` -- post processors (auto-removed)

**Manually clean up what the framework can't**:
```typescript
class MyPlugin extends Plugin {
  private observer: MutationObserver | null = null;
  private externalSubscription: any = null;

  onload() {
    this.observer = new MutationObserver(callback);
    this.observer.observe(someElement, { childList: true });

    this.externalSubscription = externalLib.subscribe(handler);
  }

  onunload() {
    this.observer?.disconnect();
    this.observer = null;

    this.externalSubscription?.unsubscribe();
    this.externalSubscription = null;
  }
}
```

**Detach custom views on unload**:
```typescript
onunload() {
  // Detach leaves of your custom view type
  this.app.workspace.detachLeavesOfType('my-custom-view');
}
```

**Test hot reload**: Rapidly toggle your plugin on/off in Settings -> Community Plugins. Check for duplicates in the UI and watch the console for double-fired events.

---

## 10. CSS Conflicts

### The Problem

Plugin CSS loads globally. Your styles can conflict with:
- Obsidian's built-in styles
- The user's active theme
- Other plugins' styles
- CSS snippets

Common symptoms: broken layouts, invisible elements, wrong colors, styles that work in one theme but break in another.

### Why It Happens

All CSS in Obsidian shares one global scope. There is no Shadow DOM isolation for plugins. Your `styles.css` is injected into the document alongside everything else.

### How to Avoid/Fix

**Namespace your selectors**:
```css
/* BAD: Affects all buttons everywhere */
button {
  background: red;
}

/* BAD: Too generic, may conflict */
.container {
  padding: 10px;
}

/* GOOD: Scoped to your plugin */
.my-plugin-container {
  padding: 10px;
}

.my-plugin-container button {
  background: red;
}
```

**Use Obsidian's CSS custom properties (variables)**:
```css
/* BAD: Hard-coded colors break in different themes */
.my-plugin-panel {
  background: #ffffff;
  color: #000000;
}

/* GOOD: Adapts to the current theme */
.my-plugin-panel {
  background: var(--background-primary);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
}
```

**Common Obsidian CSS variables to use**:
```css
/* Backgrounds */
var(--background-primary)
var(--background-secondary)
var(--background-modifier-border)
var(--background-modifier-hover)

/* Text */
var(--text-normal)
var(--text-muted)
var(--text-faint)
var(--text-accent)

/* Interactive */
var(--interactive-accent)
var(--interactive-accent-hover)
```

**Avoid `!important`**: It makes your styles impossible for themes and snippets to override. If you must use it, document why.

**Avoid styling Obsidian internals**: Don't override `.workspace`, `.view-content`, `.markdown-preview-view` etc. unless absolutely necessary. These classes change between Obsidian versions.

**Test with multiple themes**: At minimum, test with the default theme in both light and dark mode, plus one popular community theme (e.g., Minimal).

**Clean up injected styles**: If you dynamically inject `<style>` elements, remove them in `onunload()`:
```typescript
onload() {
  this.styleEl = document.createElement('style');
  this.styleEl.textContent = '...';
  document.head.appendChild(this.styleEl);
}

onunload() {
  this.styleEl?.remove();
}
```

---

## 11. Electron/Node.js Version Constraints

### The Problem

Obsidian's Electron version determines which Node.js and Chromium features are available. Different Obsidian versions ship with different Electron versions, and users on older installers may have significantly older Electron versions.

### Key Version History

| Obsidian Version | Electron Version | Node.js Version | Notes |
|:---|:---|:---|:---|
| 0.14.5 (minimum supported) | Electron v18 | Node 16 | Minimum installer version |
| 1.5.12 | Electron v28 | Node 18 | Shows upgrade notice for older installers |
| 1.8.x+ | Electron v32+ | Node 20+ | Recent versions |
| Latest (2025+) | Electron v39 | Node 20+ | Current as of this writing |

### Why It Matters

- **Modern JS features**: Optional chaining (`?.`), nullish coalescing (`??`), `Array.at()`, `structuredClone()`, top-level await -- availability depends on the Chromium version in the user's Electron.
- **Node.js built-in modules**: `node:crypto`, `node:fs/promises`, `node:stream/web` -- API surface varies by Node version.
- **Web APIs**: `Intl.Segmenter`, `Compression Streams API`, `WebGPU` -- depend on Chromium version.

### How to Avoid/Fix

- Set `minAppVersion` in your `manifest.json` to the minimum Obsidian version that has the features you need.
- Use `versions.json` to map plugin versions to minimum Obsidian versions:
  ```json
  {
    "1.0.0": "0.15.0",
    "2.0.0": "1.5.0"
  }
  ```
- Use `requireApiVersion('1.5.0')` for runtime feature detection:
  ```typescript
  if (requireApiVersion('1.5.0')) {
    // Use features available in Obsidian 1.5.0+
  }
  ```
- Avoid relying on Node.js built-in modules unless `isDesktopOnly: true`.
- Don't use bleeding-edge JS/Web features without checking availability. Transpile with esbuild targeting a compatible version.

---

## 12. File Path Issues

### The Problem

Obsidian runs on Windows, macOS, Linux, iOS, and Android. File path handling varies across all of these:

- **Case sensitivity**: macOS (HFS+) and Windows (NTFS) are case-insensitive by default. Linux (ext4) is case-sensitive. iOS and Android vary.
- **Path separators**: Windows uses `\`, everything else uses `/`. Obsidian normalizes to `/` internally.
- **Special characters**: Characters like `#`, `?`, `%`, `|`, `<`, `>`, `:`, `"`, `*` have different restrictions per OS.
- **Unicode normalization**: macOS uses NFD normalization for filenames (e.g., decomposed accented characters). Linux uses NFC.

### The `normalizePath()` Gotcha

`normalizePath()` is designed for vault-relative paths only. It:
- Replaces backslashes with forward slashes
- Collapses multiple slashes
- Removes leading and trailing slashes
- Handles spaces and special characters

**But**: it strips leading `/`, so absolute paths become relative:
```typescript
normalizePath('/users/name/file.md');
// Returns: 'users/name/file.md' -- NOT what you want for absolute paths
```

### The `getAbstractFileByPath()` Case Sensitivity Gotcha

```typescript
// This is CASE-SENSITIVE in the API
const file = vault.getAbstractFileByPath('Notes/MyFile.md');

// But file CREATION is case-insensitive on macOS/Windows
// Creating 'Notes/myfile.md' when 'Notes/MyFile.md' exists
// may succeed on Linux but fail (or overwrite) on macOS/Windows

// This can cause sync issues between Linux and macOS/Windows users
```

### How to Avoid/Fix

```typescript
// Always use normalizePath for vault-relative paths
import { normalizePath } from 'obsidian';
const vaultPath = normalizePath(`${folder}/${filename}.md`);

// Never construct paths with backslashes
// BAD:
const path = folder + '\\' + filename;
// GOOD:
const path = `${folder}/${filename}`;

// Sanitize filenames for cross-platform compatibility
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-') // Remove illegal chars
    .replace(/\s+/g, ' ')               // Collapse whitespace
    .trim();
}

// Case-insensitive file lookup (for cross-platform compatibility)
function findFileInsensitive(vault: Vault, targetPath: string): TFile | null {
  const normalized = targetPath.toLowerCase();
  return vault.getFiles().find(
    f => f.path.toLowerCase() === normalized
  ) ?? null;
}
```

---

## 13. Frontmatter Parsing Edge Cases

### The Problem

Obsidian's `processFrontMatter()` has significant limitations:
- **Destroys formatting**: Calling `processFrontMatter()` strips YAML comments, changes quote styles, reorders keys, and reformats values.
- **Removes string quotes**: Quoted strings may become unquoted.
- **Removes YAML comments**: Any `# comment` lines in frontmatter are deleted.
- **Changes types**: Some YAML-valid type annotations may be lost.

### Why It Happens

`processFrontMatter()` parses the YAML into a JavaScript object, lets you modify the object, then serializes it back to YAML. The round-trip through `parse -> object -> stringify` loses formatting, comments, and stylistic choices.

### Examples

```yaml
# Before processFrontMatter()
---
title: "My Note"  # This is a comment
tags:
  - "tag1"
  - "tag2"
date: 2024-01-15
---

# After processFrontMatter() -- even with no changes!
---
title: My Note
tags:
  - tag1
  - tag2
date: 2024-01-15
---
# Comment is gone. Quotes are gone.
```

### How to Avoid/Fix

**Use `processFrontMatter()` when formatting doesn't matter**:
```typescript
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter.tags = frontmatter.tags ?? [];
  frontmatter.tags.push('new-tag');
  // Formatting will be normalized
});
```

**Use `vault.process()` for format-preserving changes**:
```typescript
await this.app.vault.process(file, (content) => {
  // Manually parse and modify the YAML block
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    let fm = fmMatch[1];
    // Do targeted string replacement instead of parse/stringify
    fm = fm.replace(/^tags:.*$/m, 'tags: [tag1, tag2, new-tag]');
    return content.replace(fmMatch[0], `---\n${fm}\n---`);
  }
  return content;
});
```

**Use a dedicated YAML library for complex cases**:
```typescript
import * as yaml from 'js-yaml';
// Or use the yaml package which preserves comments:
// import { parseDocument } from 'yaml';

// The 'yaml' (not 'js-yaml') package can preserve comments:
import { parseDocument } from 'yaml';

await this.app.vault.process(file, (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return content;

  const doc = parseDocument(match[1]);
  doc.set('newKey', 'newValue'); // Preserves formatting and comments
  const newYaml = doc.toString();
  return content.replace(match[0], `---\n${newYaml}---`);
});
```

**Additional edge cases**:
- Frontmatter MUST be at the very top of the file (line 1). Even a blank line before `---` breaks it.
- The closing `---` must be on its own line.
- YAML `null`, `true`, `false`, `yes`, `no`, numeric strings -- these get auto-coerced by YAML parsers. A value of `no` becomes `false`. A value of `1.0` becomes a number. Quote your values if they're strings.
- Multiline strings in YAML (using `|` or `>`) may not round-trip correctly through `processFrontMatter()`.

---

## 14. Large Vault Performance

### The Problem

Plugins that work fine with 100 notes can become unusable with 10,000+ notes. Common symptoms:
- Startup takes minutes instead of seconds
- Typing lag in the editor
- Memory usage exceeds 1GB+
- The global graph view becomes unresponsive
- Quick switcher / link suggestions lag by 4+ seconds per keystroke

### Why It Happens

Many plugin patterns have O(n) or O(n^2) complexity in the number of vault files:
- Iterating all files to build an index
- Listening to every file event and doing work per file
- Storing per-file metadata in memory
- Rendering large lists in the DOM without virtualization

### Common Offenders and Fixes

**1. Processing all files on startup**:
```typescript
// BAD: Blocks startup for large vaults
async onload() {
  const files = this.app.vault.getMarkdownFiles();
  for (const file of files) {
    const content = await this.app.vault.read(file);
    this.index[file.path] = this.processContent(content);
  }
}

// BETTER: Process lazily, on-demand
async onload() {
  // Build index incrementally
  this.registerEvent(
    this.app.metadataCache.on('resolved', () => {
      // Use cached metadata instead of reading file contents
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache) {
          this.indexFromCache(file, cache);
        }
      }
    })
  );
}
```

**2. Expensive event handlers**:
```typescript
// BAD: Heavy processing on every keystroke
this.registerEvent(
  this.app.vault.on('modify', async (file) => {
    await this.reindexEntireVault(); // O(n) on every save
  })
);

// GOOD: Only process the changed file, debounced
this.registerEvent(
  this.app.vault.on('modify', this.debouncedOnModify)
);

private debouncedOnModify = debounce(
  async (file: TAbstractFile) => {
    if (file instanceof TFile) {
      await this.reindexSingleFile(file);
    }
  },
  1000,
  true
);
```

**3. DOM rendering without virtualization**:
```typescript
// BAD: Creates 10,000 DOM elements at once
renderFileList(files: TFile[]) {
  const container = this.containerEl;
  for (const file of files) {
    container.createEl('div', { text: file.basename });
  }
}

// GOOD: Use virtual scrolling or pagination
// Only render visible items. Libraries like
// 'virtual-scroll' can help, or implement a simple
// windowed rendering approach.
```

**4. Use MetadataCache instead of reading files**:
```typescript
// BAD: Reading every file to find tags
async findFilesWithTag(tag: string): Promise<TFile[]> {
  const results: TFile[] = [];
  for (const file of this.app.vault.getMarkdownFiles()) {
    const content = await this.app.vault.read(file);
    if (content.includes(tag)) results.push(file);
  }
  return results;
}

// GOOD: Use the pre-built metadata cache
findFilesWithTag(tag: string): TFile[] {
  const results: TFile[] = [];
  for (const file of this.app.vault.getMarkdownFiles()) {
    const cache = this.app.metadataCache.getFileCache(file);
    const tags = cache?.tags?.map(t => t.tag) ?? [];
    const fmTags = cache?.frontmatter?.tags ?? [];
    if (tags.includes(tag) || fmTags.includes(tag)) {
      results.push(file);
    }
  }
  return results;
}
```

---

## 15. Settings Migration

### The Problem

When you change your plugin's settings schema between versions (renaming keys, changing types, adding required fields, restructuring), users who update get a `data.json` file with the old schema. This causes runtime errors, missing settings, or silent data loss.

### Why It Happens

`this.loadData()` returns whatever JSON is in `data.json`. It has no schema validation or migration layer. The `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())` pattern from the sample plugin only handles *missing* keys -- it doesn't handle renamed keys, changed types, or removed keys.

### How to Avoid/Fix

**Add a schema version to your settings**:
```typescript
interface MyPluginSettings {
  settingsVersion: number;
  // ... your settings
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  settingsVersion: 2,
  // ...
};
```

**Implement migration functions**:
```typescript
async loadSettings() {
  const data = await this.loadData();

  if (!data) {
    // Fresh install
    this.settings = { ...DEFAULT_SETTINGS };
    return;
  }

  // Run migrations
  let migrated = { ...data };
  const version = migrated.settingsVersion ?? 0;

  if (version < 1) {
    migrated = this.migrateV0toV1(migrated);
  }
  if (version < 2) {
    migrated = this.migrateV1toV2(migrated);
  }

  this.settings = Object.assign({}, DEFAULT_SETTINGS, migrated);

  // Save migrated settings
  if (version < DEFAULT_SETTINGS.settingsVersion) {
    await this.saveSettings();
  }
}

migrateV0toV1(data: any): any {
  // Example: rename a key
  if ('oldKeyName' in data) {
    data.newKeyName = data.oldKeyName;
    delete data.oldKeyName;
  }
  data.settingsVersion = 1;
  return data;
}

migrateV1toV2(data: any): any {
  // Example: change type from string to array
  if (typeof data.tags === 'string') {
    data.tags = data.tags.split(',').map(t => t.trim());
  }
  data.settingsVersion = 2;
  return data;
}
```

**Key principles**:
- Always merge with defaults using `Object.assign({}, DEFAULT_SETTINGS, loadedData)` to handle new keys.
- Never delete settings keys without a migration path.
- Test upgrades by keeping old `data.json` files from previous versions.
- Consider logging migration actions so users can report issues.

---

## 16. Obsidian API Breaking Changes

### The Problem

Obsidian's API evolves. Methods get deprecated, renamed, or have their behavior changed. Using deprecated or changed APIs causes plugins to break when users update Obsidian.

### Notable Breaking Changes

**`Workspace.getLeaf()` behavior change**:
```typescript
// OLD (pre-1.7.2): Created new leaf
const leaf = workspace.getLeaf();

// NEW (post-1.7.2): getLeaf() without arguments may behave differently
// Use explicit arguments:
const leaf = workspace.getLeaf(true);  // New leaf in main area
const leaf = workspace.getLeaf('tab'); // New tab
const leaf = workspace.getLeaf('split'); // Split current leaf
```

**CodeMirror 5 to CodeMirror 6 migration (v0.13.x)**:
The editor engine was replaced entirely. Plugins using CM5 APIs had to be completely rewritten. This was the largest breaking change in Obsidian's history.

**`BaseOption.shouldHide` signature change**:
```typescript
// OLD: Received config as argument
shouldHide(config: Config): boolean { ... }

// NEW: Access config from BasesViewRegistration.options
shouldHide(): boolean { ... }
```

**Deferred views (v1.7.2+)**:
Views registered with `registerView()` may be loaded lazily. If your view is in the workspace but hasn't been activated yet, `leaf.view` may not be your custom view class.
```typescript
// BAD: Assumes view type based on getViewType()
if (leaf.view.getViewType() === 'my-view') {
  (leaf.view as MyCustomView).doSomething();
  // CRASH: view might be a DeferredView placeholder!
}

// GOOD: instanceof check
if (leaf.view instanceof MyCustomView) {
  leaf.view.doSomething();
}
```

### How to Stay Compatible

- Set `minAppVersion` in `manifest.json` to the oldest version you actively support.
- Maintain `versions.json` mapping plugin versions to minimum Obsidian versions.
- Use `requireApiVersion()` for runtime checks.
- Monitor the Obsidian changelog (https://obsidian.md/changelog/) for breaking changes.
- Test your plugin against the oldest supported version and the latest version.
- Avoid using undocumented APIs (anything not in the official `obsidian` npm package types). They change without notice.

---

## 17. TypeScript/Build Pipeline Issues

### The Problem

Obsidian plugins use esbuild for bundling. Common build issues include platform mismatches, external module configuration errors, and TypeScript type conflicts.

### Issue 1: Platform Configuration

```javascript
// esbuild.config.mjs

// If you don't specify platform, it defaults to "browser"
// This is usually correct for Obsidian plugins
await esbuild.build({
  platform: 'browser', // Default -- correct for most plugins
  // ...
});

// If you need Node.js APIs (and isDesktopOnly: true):
await esbuild.build({
  platform: 'node',
  // But then you must mark node built-ins as external
  external: ['obsidian', 'electron', '@codemirror/*', 'node:*'],
});
```

### Issue 2: External Modules

```javascript
// These MUST be marked external -- they're provided by Obsidian at runtime
external: [
  'obsidian',
  'electron',
  '@codemirror/autocomplete',
  '@codemirror/collab',
  '@codemirror/commands',
  '@codemirror/language',
  '@codemirror/lint',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
]

// BAD: Marking a runtime dependency as external when it's not provided by Obsidian
// Error: "Cannot find module 'my-library'" at runtime
external: ['my-library'] // Don't do this unless Obsidian provides it
```

### Issue 3: TypeScript Version Conflicts

```json
// tsconfig.json -- recommended settings
{
  "compilerOptions": {
    "target": "ES2018",
    "module": "ESNext",
    "moduleResolution": "node",
    "lib": ["DOM", "ES2018"],
    "strict": true,
    "noImplicitAny": true,
    "outDir": "./dist",
    "sourceMap": true,
    "importHelpers": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

### Issue 4: `setInterval` Type Mismatch

```typescript
// TypeScript may resolve setInterval to Node.js type (returns NodeJS.Timeout)
// But registerInterval expects a number (browser API return type)

// BAD: Type error
this.registerInterval(setInterval(() => {}, 1000));

// GOOD: Use window.setInterval explicitly
this.registerInterval(window.setInterval(() => {}, 1000));
```

### Issue 5: Importing CSS

esbuild doesn't handle CSS imports in JS by default. Your plugin's CSS must be in a separate `styles.css` file, not imported via `import './styles.css'`.

### Issue 6: Source Maps in Production

```javascript
// Don't ship source maps in production builds
const prod = process.argv[2] === 'production';
await esbuild.build({
  sourcemap: prod ? false : 'inline',
  minify: prod,
  // ...
});
```

---

## 18. The data.json File

### The Problem

Plugin settings are stored in `.obsidian/plugins/<plugin-id>/data.json`. This file can:
- Get corrupted if writes are interrupted
- Cause sync conflicts when the plugin is used on multiple devices
- Grow unboundedly if the plugin stores per-file data
- Be lost if Obsidian can't parse it

### Why It Happens

`saveData()` writes to the file asynchronously. If Obsidian crashes or the device loses power during a write, the file may be truncated or empty. Sync services (Obsidian Sync, Dropbox, iCloud, Git) may create conflict files when `data.json` changes on multiple devices simultaneously.

### How to Avoid/Fix

**Don't store large or frequently-changing data in settings**:
```typescript
// BAD: Storing per-file cache in data.json
interface Settings {
  fileCache: Record<string, { wordCount: number; lastModified: number }>;
  // data.json grows with every file in the vault
}

// GOOD: Store volatile cache separately
onload() {
  // Use a separate file for large/volatile data
  const cachePath = `${this.manifest.dir}/cache.json`;
  // Or use in-memory cache rebuilt on startup
  this.cache = new Map();
}
```

**Debounce saves**:
```typescript
// BAD: Saving on every tiny change
async onSettingChange() {
  this.settings.someValue = newValue;
  await this.saveData(this.settings); // Called 100 times/second during slider drag
}

// GOOD: Debounce saves
private debouncedSave = debounce(async () => {
  await this.saveData(this.settings);
}, 1000);

async onSettingChange() {
  this.settings.someValue = newValue;
  this.debouncedSave();
}
```

**Handle corrupt/missing data.json**:
```typescript
async loadSettings() {
  let data: any;
  try {
    data = await this.loadData();
  } catch (e) {
    console.error('Failed to load settings, using defaults:', e);
    data = null;
  }

  if (data && typeof data === 'object') {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  } else {
    this.settings = { ...DEFAULT_SETTINGS };
  }
}
```

**Sync conflict mitigation**:
- Obsidian Sync merges JSON objects: it applies local keys on top of remote keys. This works for flat settings but can cause issues with nested objects and arrays.
- If a plugin rapidly writes to `data.json` (e.g., on every file change), sync conflicts multiply. Store per-file data in vault files or a separate cache file instead.
- Obsidian Sync has a 100MB file size limit; `data.json` should never approach this, but plugins storing base64-encoded images or large datasets in settings have hit issues.

---

## 19. Workspace Serialization Gotchas

### The Problem

When Obsidian saves its state (closing the app, switching vaults), it serializes the workspace layout to `workspace.json`. Custom views must implement `getState()` and `setState()` correctly, or:
- View state is lost on restart
- Errors occur on workspace restore
- Deferred views crash when accessed before initialization

### Why It Happens

Obsidian calls `getState()` on every view when saving workspace state, and `setState()` when restoring. If these methods return/accept data that isn't JSON-serializable, or if `setState()` doesn't handle edge cases, the workspace restoration fails silently.

### The `setState` Inconsistency

The calls to `setState()` are inconsistent between different lifecycle stages:
- When activating a view: called with `{ type: 'my-view', state: {...}, active: true }`
- When restoring workspace: called with the raw state object from `workspace.json`
- When manually calling `leaf.setViewState()`: follows yet another pattern

### How to Avoid/Fix

**Implement `getState()` and `setState()` robustly**:
```typescript
class MyView extends ItemView {
  private data: string = '';

  getViewType(): string {
    return 'my-view';
  }

  getDisplayText(): string {
    return 'My View';
  }

  // Called when Obsidian saves workspace state
  getState(): any {
    return {
      data: this.data,
      // Only include JSON-serializable data
      // Do NOT include TFile objects, DOM elements, etc.
    };
  }

  // Called when Obsidian restores workspace state
  async setState(state: any, result: ViewStateResult): Promise<void> {
    // Always validate the state object -- it could be anything
    if (state && typeof state.data === 'string') {
      this.data = state.data;
    }
    // Call super.setState AFTER setting your state
    await super.setState(state, result);
    // Re-render the view
    this.render();
  }
}
```

**Handle deferred views**:
```typescript
// As of Obsidian 1.7.2+, views may be loaded lazily (deferred)
// This means leaf.view may NOT be your custom view class

// BAD:
const leaf = workspace.getLeavesOfType('my-view')[0];
(leaf.view as MyView).refresh(); // May crash -- view could be deferred

// GOOD:
const leaf = workspace.getLeavesOfType('my-view')[0];
if (leaf && leaf.view instanceof MyView) {
  leaf.view.refresh();
}
```

**Don't store non-serializable data in view state**:
```typescript
// BAD: TFile is not serializable
getState() {
  return { file: this.file }; // TFile object -- will break
}

// GOOD: Store the path, resolve on restore
getState() {
  return { filePath: this.file?.path ?? '' };
}

async setState(state: any, result: ViewStateResult) {
  if (state?.filePath) {
    const file = this.app.vault.getAbstractFileByPath(state.filePath);
    if (file instanceof TFile) {
      this.file = file;
    }
  }
  await super.setState(state, result);
}
```

---

## 20. Canvas and Non-Markdown File Handling

### The Problem

Obsidian's API is primarily designed for Markdown files. Canvas files (`.canvas`), PDFs, images, and other non-markdown files require different handling. Common mistakes:

- Assuming all `TFile` objects are Markdown files
- Trying to read metadata cache for non-markdown files
- Treating `.canvas` files as plain text without understanding the JSON structure
- Using Markdown-specific APIs on non-markdown files

### Canvas File Format

Canvas files use JSON Canvas, an open spec (https://jsoncanvas.org/). The format is:
```json
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "text",
      "x": 0, "y": 0,
      "width": 250, "height": 100,
      "text": "Node content in **markdown**"
    },
    {
      "id": "another-id",
      "type": "file",
      "x": 300, "y": 0,
      "width": 400, "height": 300,
      "file": "path/to/note.md"
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "fromNode": "unique-id",
      "toNode": "another-id"
    }
  ]
}
```

### How to Avoid/Fix

**Check file type before processing**:
```typescript
// BAD: Assumes all files are markdown
this.registerEvent(
  this.app.vault.on('modify', async (file) => {
    if (file instanceof TFile) {
      const cache = this.app.metadataCache.getFileCache(file);
      // cache is null for non-markdown files!
    }
  })
);

// GOOD: Check file extension
this.registerEvent(
  this.app.vault.on('modify', async (file) => {
    if (file instanceof TFile) {
      if (file.extension === 'md') {
        // Safe to use MetadataCache
        const cache = this.app.metadataCache.getFileCache(file);
      } else if (file.extension === 'canvas') {
        // Parse as JSON
        const content = await this.app.vault.read(file);
        const canvas = JSON.parse(content);
        // Work with canvas.nodes and canvas.edges
      }
    }
  })
);
```

**Handle TAbstractFile correctly**:
```typescript
// Vault events provide TAbstractFile, which can be TFile or TFolder
this.registerEvent(
  this.app.vault.on('delete', (file) => {
    // BAD: Assumes it's a file
    const content = await vault.read(file); // Error if it's a TFolder!

    // GOOD: Type check
    if (file instanceof TFile) {
      // It's a file
    } else if (file instanceof TFolder) {
      // It's a folder
    }
  })
);
```

**MetadataCache only works for Markdown files**:
```typescript
// MetadataCache.getFileCache() returns null for non-md files
const cache = this.app.metadataCache.getFileCache(pdfFile);
// cache === null

// For canvas files, MetadataCache does NOT fire events
// when the canvas content changes. You need to listen
// to vault 'modify' events and parse the JSON yourself.
```

**Canvas-specific pitfalls**:
- Canvas files can be large (many nodes/edges). Parse carefully.
- Node content may contain Markdown that needs further processing.
- Obsidian does not fire MetadataCache events for canvas file changes.
- The `"file"` node type references vault files by path -- these paths may become stale if the referenced file is renamed or moved.

---

## Appendix A: Quick Reference Checklist

Before publishing your plugin, verify:

- [ ] All event listeners use `registerEvent()` or `registerDomEvent()`
- [ ] All intervals use `registerInterval()` with `window.setInterval()`
- [ ] `onunload()` cleans up anything not registered via framework methods
- [ ] You don't access MetadataCache before `resolved` or `onLayoutReady()`
- [ ] Vault event handlers guard against the startup indexing phase
- [ ] File operations use Vault API, not Adapter API (unless necessary)
- [ ] No Node.js/Electron API usage without `isDesktopOnly: true`
- [ ] CSS uses Obsidian variables, not hard-coded colors
- [ ] CSS selectors are namespaced to your plugin
- [ ] Settings use `Object.assign({}, DEFAULTS, loaded)` pattern
- [ ] Settings have migration logic for schema changes
- [ ] `manifest.json` has correct `minAppVersion`
- [ ] `versions.json` maps plugin versions to Obsidian versions
- [ ] Large vault performance is tested (use `getMarkdownFiles().length` to gauge)
- [ ] Plugin works after hot-reload without duplicates
- [ ] Build marks `obsidian`, `electron`, and `@codemirror/*` as external
- [ ] No `!important` in CSS unless absolutely necessary
- [ ] Custom views implement `getState()`/`setState()` with validation
- [ ] `instanceof` checks are used before accessing `leaf.view` (deferred views)
- [ ] File type is checked before calling MetadataCache methods
- [ ] `normalizePath()` is used for vault-relative paths, not absolute paths
- [ ] Tested on at least default light/dark themes

## Appendix B: Useful Debugging Techniques

**Open DevTools**: `Ctrl+Shift+I` (desktop) or use the Obsidian command "Toggle Developer Tools".

**Monitor events**:
```typescript
// Temporarily log all vault events
['create', 'modify', 'delete', 'rename'].forEach(evt => {
  this.registerEvent(
    this.app.vault.on(evt as any, (...args: any[]) => {
      console.log(`vault.${evt}:`, ...args);
    })
  );
});
```

**Profile startup performance**:
```typescript
onload() {
  console.time('MyPlugin:load');
  // ... your loading code
  console.timeEnd('MyPlugin:load');
}
```

**Check memory**: In DevTools -> Memory -> Take Heap Snapshot. Compare snapshots before and after disabling your plugin to find leaks.

**Debug metadata cache state**:
```typescript
// Check if cache is ready
console.log('Cache resolved:', this.app.metadataCache.resolvedLinks);

// Inspect cache for a specific file
const file = this.app.vault.getAbstractFileByPath('test.md');
if (file instanceof TFile) {
  console.log('Cache:', this.app.metadataCache.getFileCache(file));
}
```

**Check Electron/Node version at runtime**:
```typescript
console.log('Electron:', process.versions.electron);
console.log('Node:', process.versions.node);
console.log('Chromium:', process.versions.chrome);
```

---

*This document was compiled from the official Obsidian Developer Documentation, the Obsidian Community Forum, GitHub issue trackers of popular plugins, and the Obsidian API type definitions. Last updated: March 2026.*
