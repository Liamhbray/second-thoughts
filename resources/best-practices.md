# Obsidian Plugin Development Best Practices

A comprehensive offline reference for building high-quality Obsidian plugins. Sourced from the official Obsidian developer documentation (docs.obsidian.md), the Obsidian API type definitions (obsidianmd/obsidian-api), community plugin review standards, and established community patterns.

---

## Table of Contents

1. [Official Plugin Guidelines](#1-official-plugin-guidelines)
2. [Submission Requirements](#2-submission-requirements)
3. [Vault API vs Adapter API](#3-vault-api-vs-adapter-api)
4. [File Access Patterns](#4-file-access-patterns)
5. [Event Handling Patterns](#5-event-handling-patterns)
6. [Settings Management](#6-settings-management)
7. [Frontmatter Handling](#7-frontmatter-handling)
8. [Performance Patterns](#8-performance-patterns)
9. [Error Handling Patterns](#9-error-handling-patterns)
10. [DOM Event Registration and Cleanup](#10-dom-event-registration-and-cleanup)
11. [Command Registration](#11-command-registration)
12. [CSS and Styling](#12-css-and-styling)
13. [Working with the Editor (CodeMirror 6)](#13-working-with-the-editor-codemirror-6)
14. [Handling Multiple Vault Windows](#14-handling-multiple-vault-windows)
15. [Ribbon Icons and Status Bar](#15-ribbon-icons-and-status-bar)
16. [Modals and Views](#16-modals-and-views)

---

## 1. Official Plugin Guidelines

Source: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

These guidelines represent the official Obsidian team's expectations for community plugins. Following them increases the chances of your plugin passing review and provides a better user experience.

### General Principles

- **Plugins must be useful.** Avoid publishing test plugins, "hello world" stubs, or plugins that duplicate core Obsidian functionality without adding meaningful value.
- **Plugins must not be harmful.** Never compromise user data, privacy, or system security. All network requests must be transparent and justified.
- **Plugins must be maintainable.** Use TypeScript, follow consistent code style, and keep dependencies minimal.

### Security

- **Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with user-defined input.** These are XSS attack vectors. Instead, use the DOM API or Obsidian's helper functions:

```typescript
// BAD -- XSS vulnerability
containerEl.innerHTML = `<div class="my-class"><b>Name: </b>${userInput}</div>`;

// GOOD -- safe DOM construction
const div = containerEl.createDiv({ cls: "my-class" });
div.createEl("b", { text: "Name: " });
div.createEl("span", { text: userInput });
```

- **Use `el.empty()` to clear element contents** instead of setting `innerHTML = ""`.

```typescript
// BAD
el.innerHTML = "";

// GOOD
el.empty();
```

### Vault and File Operations

- **Prefer the Vault API (`app.vault`) over the Adapter API (`app.vault.adapter`).** See [Section 3](#3-vault-api-vs-adapter-api) for details.
- **Never modify files in the `.obsidian` configuration folder** unless your plugin genuinely needs to manage its own config. Users and Obsidian Sync rely on the integrity of this folder.
- **Use `processFrontMatter()` instead of manually parsing YAML frontmatter.** See [Section 7](#7-frontmatter-handling).

### Styling

- **Do not hardcode styles in JavaScript.** Use CSS classes defined in your `styles.css` file.
- **Use Obsidian's CSS variables** for colors, fonts, spacing, and other visual properties so your plugin integrates with any theme:

```css
/* BAD */
.my-plugin-container {
  color: #333333;
  background-color: white;
}

/* GOOD */
.my-plugin-container {
  color: var(--text-normal);
  background-color: var(--background-primary);
}
```

- **If no suitable CSS variable exists, define your own** with a plugin-namespaced prefix so themes and snippets can override them:

```css
/* Define your own variable with a fallback */
.my-plugin-container {
  --my-plugin-accent: var(--interactive-accent);
  border-color: var(--my-plugin-accent);
}
```

### Platform Compatibility

- **Use `Platform` to detect the runtime environment** and conditionally enable/disable features:

```typescript
import { Platform } from "obsidian";

if (Platform.isMobile) {
  // Disable desktop-only features
}

if (Platform.isDesktopApp) {
  // Enable Node.js / Electron features
}
```

- **If your plugin uses Node.js or Electron APIs** (`fs`, `crypto`, `os`, `path`, `electron`), you **must** set `isDesktopOnly: true` in `manifest.json`.
- **Prefer Web API alternatives** where possible:
  - `SubtleCrypto` instead of Node's `crypto`
  - `navigator.clipboard.readText()` / `writeText()` instead of Electron clipboard
  - `fetch()` instead of Node's `http`/`https`

### Resource Cleanup

- **All resources registered via `register*()` and `add*()` methods are automatically cleaned up** when the plugin unloads. Do not manually manage cleanup for these resources -- the framework handles it.
- **Never leave dangling event listeners, intervals, or DOM mutations** outside of the registration system.

### User Experience

- **Expose user-facing text as translatable strings** where possible.
- **Provide sensible defaults** for all settings.
- **Avoid requiring the user to restart Obsidian** after changing settings. Apply settings changes immediately where feasible.
- **Avoid excessive console logging** in production builds.
- **Use `Notice` for user-visible messages** instead of `alert()` or `console.log()`:

```typescript
import { Notice } from "obsidian";

new Notice("Operation completed successfully.");
new Notice("Something went wrong. Check the console for details.", 5000); // 5-second duration
```

---

## 2. Submission Requirements

Source: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins

### Manifest and Versioning

- The `id` in `manifest.json` must be unique across the community plugin registry.
- The `version` field must follow semantic versioning (e.g., `1.0.0`).
- The GitHub release tag must **exactly match** the `version` in `manifest.json` -- no `v` prefix (use `1.0.0`, not `v1.0.0`).

### Repository Requirements

- Must have a `README.md` in the repository root describing the plugin and how to use it.
- Must include `manifest.json`, `main.js`, and (optionally) `styles.css` as binary attachments on the GitHub release.
- The repository must be public.

### Code Requirements

- **Node.js and Electron APIs are only allowed on desktop.** If used, set `isDesktopOnly: true`.
- **Do not bundle Obsidian's own API** (the `obsidian` module) in your `main.js`. It is provided by the runtime.
- **Avoid bundling large unnecessary dependencies.** Keep your bundle size minimal.
- **Do not include minified code without source.** Reviewers must be able to read your code.
- **Do not dynamically load remote code** (e.g., `eval`, loading scripts from URLs).
- **Do not access internal/private Obsidian APIs** (properties prefixed with `_`). These are undocumented, unsupported, and may break without notice.

### Developer Policies

Source: https://docs.obsidian.md/Developer+policies

- Plugins must not compromise user privacy.
- Plugins must not contain telemetry without explicit user opt-in.
- Plugins must not gate core functionality behind paywalls (can offer premium features alongside free core functionality).
- Commercial plugins must comply with Obsidian's licensing terms.

---

## 3. Vault API vs Adapter API

Source: https://docs.obsidian.md/Plugins/Vault and https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

### Overview

Obsidian exposes two APIs for file operations:

| Feature | Vault API (`app.vault`) | Adapter API (`app.vault.adapter`) |
|---|---|---|
| Abstraction level | High-level, Obsidian-aware | Low-level, filesystem-oriented |
| Caching | Built-in caching layer | No caching |
| Concurrency | Serializes operations to prevent race conditions | No serialization guarantees |
| Platform support | Cross-platform (desktop + mobile) | Varies by platform |
| Event triggering | Triggers vault events (create, modify, delete, rename) | Does not trigger vault events |
| Metadata cache | Automatically updates MetadataCache | Does not update MetadataCache |

### Always prefer the Vault API

The Vault API is the recommended approach for virtually all file operations:

```typescript
// GOOD -- using Vault API
const file = this.app.vault.getFileByPath("path/to/file.md");
if (file) {
  const content = await this.app.vault.read(file);
  await this.app.vault.modify(file, newContent);
}

// BAD -- using Adapter API unnecessarily
const content = await this.app.vault.adapter.read("path/to/file.md");
await this.app.vault.adapter.write("path/to/file.md", newContent);
```

### When the Adapter API is acceptable

Use the Adapter API only when:
- You need to access files **outside** the vault (e.g., system files, external directories).
- You need low-level filesystem operations not provided by the Vault API (e.g., checking if an arbitrary path exists outside the vault).
- You are working with non-vault binary files.

Even in these cases, mark your plugin as `isDesktopOnly` if you rely on Node.js filesystem access.

### Key Vault API Methods

```typescript
// Create a new file
const file = await this.app.vault.create("path/to/new-file.md", "Initial content");

// Read file content (see Section 8 for cachedRead vs read)
const content = await this.app.vault.read(file);
const cachedContent = await this.app.vault.cachedRead(file);

// Modify a file (replace all content)
await this.app.vault.modify(file, "New content");

// Atomic read-modify-write
await this.app.vault.process(file, (data) => {
  return data.replace("old text", "new text");
});

// Delete a file (moves to system trash by default)
await this.app.vault.trash(file, false); // false = system trash, true = Obsidian .trash

// Rename/move a file
await this.app.vault.rename(file, "new/path/to/file.md");

// Create a folder
await this.app.vault.createFolder("path/to/new-folder");

// Copy a file
await this.app.vault.copy(file, "path/to/copy.md");
```

---

## 4. File Access Patterns

### Efficient File Retrieval -- Avoid Iteration

Never iterate over all vault files to find a specific file. Use direct lookup methods:

```typescript
// BAD -- O(n) iteration
const allFiles = this.app.vault.getMarkdownFiles();
const target = allFiles.find(f => f.path === "some/path.md");

// GOOD -- O(1) direct lookup
const target = this.app.vault.getFileByPath("some/path.md");
```

### Lookup Methods

```typescript
// Get a file by its vault-relative path (returns TFile | null)
const file = this.app.vault.getFileByPath("folder/note.md");

// Get a folder by its vault-relative path (returns TFolder | null)
const folder = this.app.vault.getFolderByPath("folder");

// Get either a file or folder (returns TAbstractFile | null)
// Use getFileByPath or getFolderByPath instead when you know the type
const abstractFile = this.app.vault.getAbstractFileByPath("some/path");

// Check type when using getAbstractFileByPath
if (abstractFile instanceof TFile) {
  // It's a file
} else if (abstractFile instanceof TFolder) {
  // It's a folder
}
```

### Batch File Access

```typescript
// Get all markdown files in the vault
const markdownFiles = this.app.vault.getMarkdownFiles();

// Get ALL files (including non-markdown)
const allFiles = this.app.vault.getFiles();

// Get all files including folders
const everything = this.app.vault.getAllLoadedFiles();
```

### Using MetadataCache for Efficient Queries

The `MetadataCache` pre-parses all markdown files and maintains an indexed cache. Use it instead of reading and parsing files manually:

```typescript
// Get cached metadata for a file (headings, links, tags, frontmatter, etc.)
const cache = this.app.metadataCache.getFileCache(file);
if (cache) {
  const frontmatter = cache.frontmatter;
  const tags = cache.tags;
  const links = cache.links;
  const headings = cache.headings;
}

// Resolve a link to a TFile
const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
  "linked-note",    // link text
  "source/note.md"  // source file path for resolving relative links
);

// Get all resolved links
const resolvedLinks = this.app.metadataCache.resolvedLinks;
// resolvedLinks["source.md"]["target.md"] = number of links
```

### Working with File Paths

```typescript
// Get the file extension
const ext = file.extension; // "md", "png", etc.

// Get the filename without extension
const basename = file.basename; // "my-note"

// Get the full vault-relative path
const path = file.path; // "folder/my-note.md"

// Get the parent folder
const parent = file.parent; // TFolder | null

// Build paths safely
import { normalizePath } from "obsidian";
const safePath = normalizePath("folder//subfolder/file.md");
// Returns "folder/subfolder/file.md"
```

---

## 5. Event Handling Patterns

Source: https://docs.obsidian.md/Plugins/Events

### The Golden Rule: Always Use `registerEvent()`

The `registerEvent()` method on `Component` (which `Plugin` extends) ensures automatic cleanup when your plugin unloads. **Never** subscribe to events without it:

```typescript
// BAD -- memory leak, event handler persists after plugin disable
this.app.vault.on("create", (file) => { /* ... */ });

// GOOD -- auto-cleanup on plugin unload
this.registerEvent(
  this.app.vault.on("create", (file) => {
    console.log("File created:", file.path);
  })
);
```

### Vault Events

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // File created
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          // Handle new file
        }
      })
    );

    // File content modified
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          // Handle file modification
        }
      })
    );

    // File deleted
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          // Handle file deletion
        }
      })
    );

    // File renamed or moved
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          // Handle rename, oldPath contains the previous path
        }
      })
    );
  }
}
```

### Workspace Events

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Active leaf (tab) changed
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf) {
          // New active leaf
        }
      })
    );

    // A file was opened in a pane
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          // A file was opened
        }
      })
    );

    // Layout changed (panes rearranged, opened, closed)
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        // React to layout changes
      })
    );

    // Editor changed (cursor moved, text changed)
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        // React to editor changes
      })
    );
  }
}
```

### MetadataCache Events

```typescript
// Metadata for a specific file was resolved
this.registerEvent(
  this.app.metadataCache.on("changed", (file, data, cache) => {
    // file: TFile that changed
    // data: raw file content
    // cache: CachedMetadata
  })
);

// All files in the vault have been indexed
this.registerEvent(
  this.app.metadataCache.on("resolved", () => {
    // Safe to query metadata for all files
  })
);
```

### Deferring Events Until Layout Ready

During startup, Obsidian fires many events as it loads files. To avoid processing these, defer event registration until the workspace is ready:

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Defer vault event registration until layout is ready
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          // This won't fire for files loaded during startup
        })
      );
    });
  }
}
```

### Timer Registration

```typescript
// GOOD -- auto-cleared on unload
this.registerInterval(
  window.setInterval(() => {
    // Periodic task
  }, 60000) // every 60 seconds
);

// NOTE: Use window.setInterval(), not setInterval()
// This ensures TypeScript uses the browser API (returns number)
// instead of Node.js API (returns NodeJS.Timeout)
```

---

## 6. Settings Management

Source: https://docs.obsidian.md/Plugins/User+interface/Settings

### Complete Settings Pattern

```typescript
import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

// 1. Define the settings interface
interface MyPluginSettings {
  apiKey: string;
  enableFeature: boolean;
  maxItems: number;
  outputFolder: string;
}

// 2. Define sensible defaults
const DEFAULT_SETTINGS: MyPluginSettings = {
  apiKey: "",
  enableFeature: true,
  maxItems: 10,
  outputFolder: "output",
};

// 3. Plugin class with settings
export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    // Register the settings tab
    this.addSettingTab(new MyPluginSettingTab(this.app, this));

    // Use settings throughout your plugin
    if (this.settings.enableFeature) {
      // ...
    }
  }

  // 4. Load settings with default merging
  async loadSettings() {
    // Object.assign merges saved data on top of defaults,
    // so new settings added in updates get their defaults automatically
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  // 5. Save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// 6. Settings tab UI
class MyPluginSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty(); // Always clear before rebuilding

    containerEl.createEl("h2", { text: "My Plugin Settings" });

    // Text input
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("Enter your API key.")
      .addText((text) =>
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // Toggle
    new Setting(containerEl)
      .setName("Enable feature")
      .setDesc("Turn this feature on or off.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableFeature)
          .onChange(async (value) => {
            this.plugin.settings.enableFeature = value;
            await this.plugin.saveSettings();
          })
      );

    // Slider
    new Setting(containerEl)
      .setName("Max items")
      .setDesc("Maximum number of items to display.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 100, 1)
          .setValue(this.plugin.settings.maxItems)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxItems = value;
            await this.plugin.saveSettings();
          })
      );

    // Dropdown
    new Setting(containerEl)
      .setName("Output folder")
      .setDesc("Where to save output files.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("output", "Output")
          .addOption("inbox", "Inbox")
          .addOption("archive", "Archive")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
```

### Settings Best Practices

- **Always merge with defaults** using `Object.assign({}, DEFAULT_SETTINGS, savedData)`. This ensures that when you add new settings in a plugin update, users get the default values for the new fields without losing their existing settings.
- **Call `containerEl.empty()`** at the start of `display()` to prevent duplicate UI elements when the settings tab is re-opened.
- **Save settings immediately on change** (in each `onChange` callback) so users never lose changes.
- **Use descriptive names and descriptions** for each setting to make the UI self-documenting.
- **Validate settings values** before using them in your plugin logic:

```typescript
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  // Validate
  if (this.settings.maxItems < 1) {
    this.settings.maxItems = DEFAULT_SETTINGS.maxItems;
  }
}
```

### Settings Storage

- `saveData(data)` stores data as JSON in `.obsidian/plugins/<plugin-id>/data.json`.
- `loadData()` reads and parses that JSON file. Returns `null` if the file does not exist.
- You can store any JSON-serializable data. Avoid storing `TFile` objects, DOM elements, or other non-serializable references.
- Data is vault-specific. Each vault has its own copy of plugin settings.

---

## 7. Frontmatter Handling

Source: https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter

### Always Use `processFrontMatter()`

The `app.fileManager.processFrontMatter()` method provides **atomic** frontmatter updates. It reads the file, parses the YAML, passes the parsed object to your callback, and writes the modified YAML back. This is the only correct way to modify frontmatter in a plugin.

```typescript
// GOOD -- atomic, safe, triggers proper cache updates
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  // Mutate the frontmatter object directly
  frontmatter["status"] = "reviewed";
  frontmatter["tags"] = ["tag1", "tag2"];
  frontmatter["lastModified"] = new Date().toISOString();

  // Delete a property
  delete frontmatter["oldProperty"];
});
```

### Why Not Manual Parsing?

```typescript
// BAD -- fragile, error-prone, doesn't trigger cache updates
const content = await this.app.vault.read(file);
const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
if (yamlMatch) {
  // Manual YAML parsing is fragile
  // Does not properly handle edge cases
  // Does not trigger MetadataCache updates
  // Race condition if file is modified concurrently
}
```

### Reading Frontmatter (Without Modifying)

For read-only access, use the MetadataCache -- it is faster and does not require reading the file:

```typescript
// Read frontmatter from cache (no file I/O needed)
const cache = this.app.metadataCache.getFileCache(file);
if (cache?.frontmatter) {
  const title = cache.frontmatter["title"];
  const tags = cache.frontmatter["tags"];
  // Note: cache.frontmatter includes position info in the "position" key
}
```

### Important Caveats

- **Mutate the frontmatter object in place.** Do not reassign the parameter:

```typescript
// BAD -- does nothing
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter = { newKey: "value" }; // This reassigns the local variable, not the file
});

// GOOD -- mutate in place
await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
  frontmatter["newKey"] = "value";
});
```

- **The callback must be synchronous.** You cannot use `async/await` inside the `processFrontMatter` callback.
- **Formatting changes.** `processFrontMatter` may reformat existing YAML (removing comments, changing quote styles). This is a known limitation.
- **Deleting all properties.** If you delete all frontmatter properties, the change may not be saved. Ensure at least one property remains, or use `vault.modify()` to remove the entire frontmatter block.

---

## 8. Performance Patterns

Source: https://docs.obsidian.md/Plugins/Guides/Optimizing+plugin+load+time

### `cachedRead()` vs `read()`

```typescript
// Use cachedRead when you only need to DISPLAY content
// It avoids unnecessary disk reads if the file is already in memory
const displayContent = await this.app.vault.cachedRead(file);

// Use read when you intend to MODIFY the content
// This ensures you get the absolute latest version from disk
const contentToModify = await this.app.vault.read(file);
```

**When to use which:**
- `cachedRead()`: Displaying file content in a view, searching through file contents, any read-only operation.
- `read()`: When you need to read content, modify it, and write it back. Prevents overwriting with stale data.
- The cache invalidates when a file is modified outside of Obsidian (as soon as the filesystem notifies Obsidian) and when the file is saved within Obsidian. In practice, `cachedRead` returns stale data only in a very narrow race window.

### Use `vault.process()` for Atomic Read-Modify-Write

```typescript
// GOOD -- atomic, no race conditions
await this.app.vault.process(file, (data) => {
  return data.replace("old text", "new text");
});

// BAD -- race condition between read and modify
const content = await this.app.vault.read(file);
const modified = content.replace("old text", "new text");
await this.app.vault.modify(file, modified);
```

### Defer Heavy Work Until Layout Ready

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Register lightweight things immediately (commands, settings, ribbon)
    this.addCommand({ id: "my-cmd", name: "My Command", callback: () => {} });
    this.addSettingTab(new MySettingTab(this.app, this));

    // Defer heavy initialization
    this.app.workspace.onLayoutReady(() => {
      this.initializeHeavyFeature();
    });
  }

  private initializeHeavyFeature() {
    // Index files, register vault events, build caches, etc.
    this.registerEvent(
      this.app.vault.on("create", (file) => { /* ... */ })
    );
  }
}
```

### Debouncing

Use Obsidian's built-in `debounce` function (imported from `obsidian`) for operations that may fire rapidly:

```typescript
import { debounce, Plugin } from "obsidian";

export default class MyPlugin extends Plugin {
  // Debounce saves to avoid excessive I/O
  private debouncedSave = debounce(
    async () => {
      await this.saveSettings();
    },
    1000,  // wait 1 second after last call
    true   // resetTimer: restart the timer on each call
  );

  // Debounce search/filter operations
  private debouncedSearch = debounce(
    (query: string) => {
      this.performSearch(query);
    },
    300,
    true
  );
}
```

### Avoid Blocking the Main Thread

- **Break up large loops** with `setTimeout` or `requestAnimationFrame`:

```typescript
async processFiles(files: TFile[]) {
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    for (const file of batch) {
      await this.processFile(file);
    }
    // Yield to the main thread between batches
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
```

- **Use `MetadataCache` instead of reading and parsing files** whenever possible. The cache is maintained by Obsidian in the background and is essentially free to query.
- **Avoid synchronous file operations.** Always use `await` with vault methods.

### Minimizing Plugin Load Time

- **Lazy-load heavy modules.** Use dynamic `import()` for modules only needed in specific features:

```typescript
async onload() {
  this.addCommand({
    id: "heavy-feature",
    name: "Run heavy feature",
    callback: async () => {
      // Only load the module when the command is invoked
      const { HeavyFeature } = await import("./heavy-feature");
      new HeavyFeature(this.app).run();
    },
  });
}
```

- **Do not `await` long operations in `onload()`.** This blocks Obsidian startup. Fire-and-forget or defer:

```typescript
async onload() {
  // DON'T do this -- blocks startup
  // await this.indexAllFiles();

  // DO this -- non-blocking
  this.app.workspace.onLayoutReady(() => {
    this.indexAllFiles(); // intentionally not awaited
  });
}
```

---

## 9. Error Handling Patterns

### Wrap Async Operations in Try-Catch

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    try {
      await this.loadSettings();
    } catch (e) {
      console.error("Failed to load settings:", e);
      new Notice("My Plugin: Failed to load settings. Using defaults.");
      this.settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }
}
```

### Use `Notice` for User-Facing Errors

```typescript
async processFile(file: TFile) {
  try {
    const content = await this.app.vault.read(file);
    // ... process
  } catch (e) {
    console.error(`Error processing ${file.path}:`, e);
    new Notice(`Failed to process "${file.basename}". See console for details.`);
  }
}
```

### Handle Missing Files Gracefully

```typescript
const file = this.app.vault.getFileByPath("might/not/exist.md");
if (!file) {
  new Notice("File not found: might/not/exist.md");
  return;
}
// Proceed with file
```

### Async Command Error Handling

```typescript
this.addCommand({
  id: "my-async-command",
  name: "My async command",
  callback: async () => {
    try {
      await this.performAsyncOperation();
      new Notice("Operation completed.");
    } catch (e) {
      console.error("Command failed:", e);
      new Notice("Operation failed. Check console for details.");
    }
  },
});
```

### Defensive Event Handling

```typescript
this.registerEvent(
  this.app.vault.on("modify", (file) => {
    try {
      if (!(file instanceof TFile)) return;
      if (file.extension !== "md") return;
      this.handleModify(file);
    } catch (e) {
      console.error("Error in modify handler:", e);
    }
  })
);
```

### Validate External Data

```typescript
async loadExternalConfig(): Promise<Config> {
  try {
    const raw = await this.app.vault.adapter.read("config.json");
    const parsed = JSON.parse(raw);

    // Validate required fields
    if (typeof parsed.version !== "number") {
      throw new Error("Invalid config: missing version");
    }

    return parsed as Config;
  } catch (e) {
    console.error("Failed to load external config:", e);
    return this.getDefaultConfig();
  }
}
```

---

## 10. DOM Event Registration and Cleanup

### Use `registerDomEvent()` for All DOM Events

The `registerDomEvent()` method on `Component` ensures automatic cleanup. It supports `Window`, `Document`, and `HTMLElement` targets:

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Window-level events
    this.registerDomEvent(window, "resize", () => {
      this.handleResize();
    });

    // Document-level events
    this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        this.handleEscape();
      }
    });

    // Element-level events (for persistent elements)
    const ribbonIcon = this.addRibbonIcon("dice", "My Plugin", () => {});
    this.registerDomEvent(ribbonIcon, "contextmenu", (evt: MouseEvent) => {
      evt.preventDefault();
      this.showContextMenu(evt);
    });
  }
}
```

### Common Mistakes

```typescript
// BAD -- memory leak, not cleaned up on unload
document.addEventListener("click", this.handleClick);

// BAD -- manual cleanup is error-prone and verbose
onload() {
  this.clickHandler = this.handleClick.bind(this);
  document.addEventListener("click", this.clickHandler);
}
onunload() {
  document.removeEventListener("click", this.clickHandler);
}

// GOOD -- automatic cleanup
onload() {
  this.registerDomEvent(document, "click", (evt) => {
    this.handleClick(evt);
  });
}
```

### DOM Events in Custom Views

For events on elements within custom views (e.g., `ItemView`), you can still use `registerDomEvent` since `ItemView` extends `Component`:

```typescript
class MyView extends ItemView {
  async onOpen() {
    const button = this.contentEl.createEl("button", { text: "Click me" });

    // This is cleaned up when the view is closed
    this.registerDomEvent(button, "click", () => {
      new Notice("Button clicked!");
    });
  }
}
```

### Using `register()` for Custom Cleanup

For cleanup tasks that do not fit `registerEvent` or `registerDomEvent`, use the generic `register()`:

```typescript
onload() {
  const observer = new MutationObserver((mutations) => {
    // Handle mutations
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Register custom cleanup
  this.register(() => {
    observer.disconnect();
  });
}
```

---

## 11. Command Registration

Source: https://docs.obsidian.md/Plugins/User+interface/Commands

### Basic Command

```typescript
this.addCommand({
  id: "my-plugin-do-thing",
  name: "Do the thing",
  callback: () => {
    // Executed when user invokes the command
    this.doTheThing();
  },
});
```

### Conditional Commands with `checkCallback`

Use `checkCallback` when the command should only be available under certain conditions:

```typescript
this.addCommand({
  id: "my-plugin-process-note",
  name: "Process current note",
  checkCallback: (checking: boolean) => {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      if (!checking) {
        // Actually execute the command
        this.processNote(file);
      }
      return true; // Command is available
    }
    return false; // Command is not available (hidden from palette)
  },
});
```

**How `checkCallback` works:**
- Called with `checking = true` to determine if the command should appear in the palette.
- Called with `checking = false` to actually execute the command.
- Return `true` if the command is applicable, `false` otherwise.

### Editor Commands

Use `editorCallback` when the command requires an active editor:

```typescript
this.addCommand({
  id: "my-plugin-insert-text",
  name: "Insert text at cursor",
  editorCallback: (editor: Editor, view: MarkdownView) => {
    const selection = editor.getSelection();
    editor.replaceSelection(`**${selection}**`);
  },
});
```

Editor commands are **automatically hidden** from the command palette when no editor is active.

### Conditional Editor Commands

```typescript
this.addCommand({
  id: "my-plugin-process-selection",
  name: "Process selection",
  editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
    const selection = editor.getSelection();
    if (selection.length > 0) {
      if (!checking) {
        this.processSelection(selection, editor);
      }
      return true;
    }
    return false;
  },
});
```

### Command Best Practices

- **Use descriptive, unique IDs** prefixed with your plugin ID: `my-plugin-action-name`.
- **Use clear, concise command names** that describe what the command does. Obsidian automatically prepends your plugin name.
- **Add hotkeys sparingly.** Let users set their own. You can suggest defaults:

```typescript
this.addCommand({
  id: "my-plugin-quick-action",
  name: "Quick action",
  hotkeys: [{ modifiers: ["Mod", "Shift"], key: "j" }],
  callback: () => { /* ... */ },
});
```

- **Prefer `checkCallback` over `callback`** when the command is context-dependent. This hides it from the palette when it cannot be used, reducing clutter.
- **Prefer `editorCallback` over manually getting the active editor** for commands that need editor access.

---

## 12. CSS and Styling

Source: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables and https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

### Fundamental Rules

1. **All styles go in `styles.css`**, never in JavaScript.
2. **Use Obsidian CSS variables** instead of hardcoded colors/sizes.
3. **Prefix all CSS classes** with your plugin ID to avoid collisions.
4. **Support both light and dark themes** by using CSS variables (they adapt automatically).

### Namespace Your CSS Classes

```css
/* BAD -- generic class names will collide */
.container { }
.title { }
.active { }

/* GOOD -- namespaced class names */
.my-plugin-container { }
.my-plugin-title { }
.my-plugin-item--active { }
```

### Essential CSS Variables

```css
/* Colors */
var(--text-normal)            /* Primary text color */
var(--text-muted)             /* Secondary/dimmed text */
var(--text-faint)             /* Tertiary/very dim text */
var(--text-accent)            /* Accent/link color */
var(--text-on-accent)         /* Text on accent-colored backgrounds */

/* Backgrounds */
var(--background-primary)     /* Main content background */
var(--background-secondary)   /* Sidebar/secondary background */
var(--background-modifier-hover)       /* Hover state */
var(--background-modifier-active-hover) /* Active hover state */
var(--background-modifier-border)      /* Border color */
var(--background-modifier-error)       /* Error state background */
var(--background-modifier-success)     /* Success state background */

/* Interactive elements */
var(--interactive-accent)     /* Buttons, toggles, active states */
var(--interactive-accent-hover) /* Interactive hover state */
var(--interactive-normal)     /* Default interactive background */
var(--interactive-hover)      /* Interactive hover */

/* Typography */
var(--font-text)              /* Body text font */
var(--font-monospace)         /* Code font */
var(--font-interface)         /* UI font */
var(--font-text-size)         /* Body text size */

/* Spacing and sizing */
var(--size-4-1)  /* 4px */
var(--size-4-2)  /* 8px */
var(--size-4-3)  /* 12px */
var(--size-4-4)  /* 16px */
var(--size-4-6)  /* 24px */
var(--size-4-8)  /* 32px */

/* Borders */
var(--radius-s)               /* Small border radius */
var(--radius-m)               /* Medium border radius */
var(--radius-l)               /* Large border radius */
```

### Example: Plugin Styles

```css
/* styles.css */
.my-plugin-panel {
  padding: var(--size-4-4);
  background-color: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
}

.my-plugin-panel-header {
  font-family: var(--font-interface);
  font-size: var(--font-text-size);
  font-weight: 600;
  color: var(--text-normal);
  margin-bottom: var(--size-4-3);
}

.my-plugin-item {
  padding: var(--size-4-2) var(--size-4-3);
  border-radius: var(--radius-s);
  color: var(--text-muted);
  cursor: pointer;
}

.my-plugin-item:hover {
  background-color: var(--background-modifier-hover);
  color: var(--text-normal);
}

.my-plugin-item.is-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}

.my-plugin-error {
  color: var(--text-error);
  background-color: var(--background-modifier-error);
  padding: var(--size-4-2);
  border-radius: var(--radius-s);
}
```

### Defining Plugin-Specific CSS Variables

```css
/* Allow themes/snippets to override your plugin's look */
body {
  --my-plugin-bg: var(--background-secondary);
  --my-plugin-accent: var(--interactive-accent);
  --my-plugin-border: var(--background-modifier-border);
}

.my-plugin-container {
  background: var(--my-plugin-bg);
  border: 1px solid var(--my-plugin-border);
}
```

### Creating DOM Elements with Obsidian Helpers

```typescript
// Obsidian extends HTMLElement with helper methods
const container = containerEl.createDiv({ cls: "my-plugin-container" });
const title = container.createEl("h3", {
  text: "My Panel",
  cls: "my-plugin-panel-header",
});
const list = container.createEl("ul", { cls: "my-plugin-list" });

// Creating elements with attributes
const link = container.createEl("a", {
  text: "Click here",
  href: "https://example.com",
  cls: "my-plugin-link",
  attr: { target: "_blank", rel: "noopener" },
});

// Adding multiple classes
const item = container.createDiv({ cls: "my-plugin-item is-active" });
```

---

## 13. Working with the Editor (CodeMirror 6)

Source: https://docs.obsidian.md/Plugins/Editor/Editor+extensions

Obsidian's editor is built on CodeMirror 6 (CM6). Plugins can extend it using CM6's extension system.

### Registering Editor Extensions

```typescript
import { Plugin } from "obsidian";
import { ViewPlugin, EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

export default class MyPlugin extends Plugin {
  async onload() {
    // registerEditorExtension handles loading on all active editors
    // and unloading when the plugin is disabled
    this.registerEditorExtension(myEditorExtension);
  }
}
```

### Critical Rule: Use Obsidian's CM6 Packages

**Never install your own version of `@codemirror/*` packages.** Import from the exact same packages that Obsidian uses. Different versions of CM6 classes will cause silent failures. Your `package.json` should list CM6 packages as `devDependencies` only, and your bundler must mark them as external:

```javascript
// esbuild config
{
  external: ["obsidian", "@codemirror/view", "@codemirror/state", ...],
}
```

### View Plugins

View plugins have access to the viewport and can provide decorations, but cannot make changes that affect the editor's vertical layout (no inserting block elements that change line heights):

```typescript
import { ViewPlugin, ViewUpdate, DecorationSet, Decoration, EditorView, WidgetType } from "@codemirror/view";

class MyWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = " [widget] ";
    span.className = "my-plugin-widget";
    return span;
  }
}

const myViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const builder: any[] = [];
      for (const { from, to } of view.visibleRanges) {
        // Add decorations within the visible range
      }
      return Decoration.set(builder);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);
```

### State Fields

State fields store custom state that persists across editor updates. Use them when you need to track state that depends on document changes, or when you need to produce decorations that affect vertical layout:

```typescript
import { StateField, StateEffect, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

// Define a state effect for toggling
const toggleEffect = StateEffect.define<boolean>();

// Define a state field
const myStateField = StateField.define<DecorationSet>({
  create(): DecorationSet {
    return Decoration.none;
  },

  update(decorations: DecorationSet, tr: Transaction): DecorationSet {
    decorations = decorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(toggleEffect)) {
        // Rebuild decorations based on the effect
      }
    }

    return decorations;
  },

  provide(field) {
    return EditorView.decorations.from(field);
  },
});
```

### View Plugin vs State Field -- When to Use Which

| Use Case | View Plugin | State Field |
|---|---|---|
| Inline decorations (mark, replace) | Yes | Yes |
| Block decorations (line widgets) | No | Yes |
| Needs viewport info | Yes | No |
| Performance with large docs | Better (only processes visible range) | Processes entire doc |
| Persists state across updates | No (recomputed) | Yes |

### Decoration Types

- **Mark decorations**: Style existing text (`Decoration.mark({ class: "my-highlight" })`)
- **Widget decorations**: Insert custom HTML elements (`Decoration.widget({ widget: new MyWidget() })`)
- **Replace decorations**: Replace document content with a widget (`Decoration.replace({ widget: new MyWidget() })`)
- **Line decorations**: Add styling to entire lines (`Decoration.line({ class: "my-line-style" })`)

### Communicating with Editor Extensions

Use `StateEffect` to dispatch actions to your extensions:

```typescript
// From plugin code, dispatch an effect to the editor
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  const editorView = (view.editor as any).cm as EditorView;
  editorView.dispatch({
    effects: toggleEffect.of(true),
  });
}
```

### Accessing the Editor API

```typescript
// Get the active editor (high-level Obsidian API)
const editor = this.app.workspace.activeEditor?.editor;
if (editor) {
  const cursor = editor.getCursor();
  const selection = editor.getSelection();
  editor.replaceRange("inserted text", cursor);
}

// Get the underlying CM6 EditorView (low-level)
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  const cmEditor = (view.editor as any).cm as EditorView;
  // Use CM6 APIs directly
}
```

---

## 14. Handling Multiple Vault Windows

Source: https://obsidian.md/blog/how-to-update-plugins-to-support-pop-out-windows/

Since Obsidian Desktop v0.15.6, users can open multiple windows (pop-out windows) for the same vault. Plugins must handle this correctly.

### Key Concepts

- **`activeWindow`**: Global variable pointing to the currently focused window.
- **`activeDocument`**: Global variable pointing to the document of the currently focused window.
- **`element.win`**: The `Window` object that the element belongs to.
- **`element.doc`**: The `Document` object that the element belongs to.

### Rules for Multi-Window Compatibility

1. **Never use `document` directly for creating elements.** Use `activeDocument` or `element.doc` instead:

```typescript
// BAD -- always creates elements in the main window
const el = document.createElement("div");

// GOOD -- creates elements in the correct window
const el = activeDocument.createElement("div");

// BEST -- use Obsidian's helpers, which handle this automatically
const el = containerEl.createDiv();
```

2. **Never use `window` directly for window-specific operations.** Use `activeWindow` or `element.win`:

```typescript
// BAD
window.open("https://example.com");

// GOOD
activeWindow.open("https://example.com");
```

3. **Use `instanceOf()` instead of `instanceof` for cross-window type checks:**

```typescript
// BAD -- fails across windows because each window has its own HTMLElement class
if (element instanceof HTMLElement) { /* ... */ }

// GOOD -- works across windows
if (element.instanceOf(HTMLElement)) { /* ... */ }

// Similarly for events
if (event.instanceOf(MouseEvent)) { /* ... */ }
```

4. **Handle window migration** for complex renderers (e.g., canvas elements):

```typescript
element.onWindowMigrated(() => {
  // Re-initialize rendering context when element moves to a new window
  this.reinitializeCanvas();
});
```

### Iterating All Leaves Across Windows

```typescript
// Iterates all leaves including pop-out windows
this.app.workspace.iterateAllLeaves((leaf) => {
  // Process each leaf
});

// Get leaves of a specific type across all windows
const leaves = this.app.workspace.getLeavesOfType("my-view-type");
```

### Opening Content in Pop-Out Windows

```typescript
// Open a new pop-out window with a leaf
const leaf = this.app.workspace.openPopoutLeaf();
await leaf.setViewState({ type: "my-view-type" });

// Migrate an existing leaf to a pop-out window
this.app.workspace.migrateLeafToPopout(existingLeaf);
```

---

## 15. Ribbon Icons and Status Bar

### Ribbon Icons

Source: https://docs.obsidian.md/Plugins/User+interface/Ribbon+actions

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Add a ribbon icon (automatically cleaned up on unload)
    const ribbonIconEl = this.addRibbonIcon(
      "dice",           // Icon ID (from Lucide icons)
      "My Plugin",      // Tooltip text
      (evt: MouseEvent) => {
        // Click handler
        new Notice("Ribbon icon clicked!");
      }
    );

    // Optionally add a CSS class to the ribbon icon
    ribbonIconEl.addClass("my-plugin-ribbon-icon");
  }
}
```

### Available Icons

Obsidian uses the [Lucide](https://lucide.dev/) icon set. Common icons include: `file-text`, `folder`, `search`, `settings`, `star`, `check`, `x`, `plus`, `minus`, `edit`, `trash`, `link`, `external-link`, `copy`, `clipboard`, `download`, `upload`, `refresh-cw`, `alert-triangle`, `info`, `help-circle`.

### Custom Icons

```typescript
import { addIcon } from "obsidian";

// Register a custom SVG icon (viewBox must be "0 0 100 100")
addIcon("my-custom-icon", `<circle cx="50" cy="50" r="40" fill="currentColor" />`);

// Use it in a ribbon icon
this.addRibbonIcon("my-custom-icon", "My Custom Action", () => {});
```

### Status Bar

Source: https://docs.obsidian.md/Reference/TypeScript+API/Plugin/addStatusBarItem

**Important:** Status bar items are **not available on mobile** (mobile Obsidian does not display the status bar).

```typescript
export default class MyPlugin extends Plugin {
  private statusBarEl: HTMLElement;

  async onload() {
    // Add a status bar item (automatically cleaned up on unload)
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Ready");

    // Update it later
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          const wordCount = this.countWords(file);
          this.statusBarEl.setText(`Words: ${wordCount}`);
        }
      })
    );
  }
}
```

### Status Bar with Icon

```typescript
import { setIcon } from "obsidian";

const statusBarEl = this.addStatusBarItem();
setIcon(statusBarEl, "activity");
statusBarEl.createSpan({ text: " Connected" });
```

### Best Practices for Ribbon and Status Bar

- **Use the ribbon sparingly.** Only add a ribbon icon if your plugin has a primary action that users invoke frequently. Too many ribbon icons clutter the sidebar.
- **Keep status bar text short.** Space is limited and shared among all plugins.
- **Update status bar text reactively**, not on a timer. React to events (file open, workspace change) rather than polling.
- **Check `Platform.isMobile`** before relying on status bar items -- they are hidden on mobile.
- **Ribbon icons are automatically cleaned up** on plugin unload. You do not need to remove them manually.

---

## 16. Modals and Views

### Basic Modal

Source: https://docs.obsidian.md/Plugins/User+interface/Modals

```typescript
import { App, Modal, Setting } from "obsidian";

class MyModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Enter a value" });

    new Setting(contentEl)
      .setName("Value")
      .addText((text) =>
        text.onChange((value) => {
          this.result = value;
        })
      );

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Submit")
          .setCta() // "call to action" styling
          .onClick(() => {
            this.close();
            this.onSubmit(this.result);
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty(); // Clean up DOM
  }
}

// Usage
new MyModal(this.app, (result) => {
  new Notice(`You entered: ${result}`);
}).open();
```

### Confirmation Modal Pattern

```typescript
class ConfirmModal extends Modal {
  message: string;
  onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("p", { text: this.message });

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

    buttonContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
      this.close();
    });

    const confirmBtn = buttonContainer.createEl("button", {
      text: "Confirm",
      cls: "mod-cta",
    });
    confirmBtn.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

### Suggest Modal (Searchable List)

```typescript
import { SuggestModal, App } from "obsidian";

interface BookSuggestion {
  title: string;
  author: string;
}

class BookSuggestModal extends SuggestModal<BookSuggestion> {
  books: BookSuggestion[];
  onChoose: (book: BookSuggestion) => void;

  constructor(app: App, books: BookSuggestion[], onChoose: (book: BookSuggestion) => void) {
    super(app);
    this.books = books;
    this.onChoose = onChoose;
  }

  getSuggestions(query: string): BookSuggestion[] {
    return this.books.filter((book) =>
      book.title.toLowerCase().includes(query.toLowerCase()) ||
      book.author.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderSuggestion(book: BookSuggestion, el: HTMLElement) {
    el.createEl("div", { text: book.title });
    el.createEl("small", { text: book.author, cls: "suggestion-author" });
  }

  onChooseSuggestion(book: BookSuggestion, evt: MouseEvent | KeyboardEvent) {
    this.onChoose(book);
  }
}
```

### Fuzzy Suggest Modal

```typescript
import { FuzzySuggestModal, App, FuzzyMatch } from "obsidian";

class FileSuggestModal extends FuzzySuggestModal<string> {
  items: string[];
  onChoose: (item: string) => void;

  constructor(app: App, items: string[], onChoose: (item: string) => void) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item; // Used for fuzzy matching
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    this.onChoose(item);
  }
}
```

### Custom Views (ItemView)

Source: https://docs.obsidian.md/Plugins/User+interface/Views

```typescript
import { ItemView, WorkspaceLeaf, Plugin } from "obsidian";

const VIEW_TYPE_EXAMPLE = "my-plugin-view";

class MyPluginView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXAMPLE;
  }

  getDisplayText(): string {
    return "My Plugin View";
  }

  getIcon(): string {
    return "file-text"; // Lucide icon name
  }

  async onOpen() {
    const container = this.containerEl.children[1]; // Content area
    container.empty();
    container.createEl("h4", { text: "My Plugin View" });
    container.createEl("p", { text: "Hello from the plugin view!" });
  }

  async onClose() {
    // Clean up resources
  }
}
```

### Registering and Activating Views

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // Register the view type
    this.registerView(VIEW_TYPE_EXAMPLE, (leaf) => new MyPluginView(leaf));

    // Add a command to open the view
    this.addCommand({
      id: "open-my-view",
      name: "Open my plugin view",
      callback: () => this.activateView(),
    });

    // Optionally add a ribbon icon to open the view
    this.addRibbonIcon("file-text", "Open my plugin view", () => {
      this.activateView();
    });
  }

  async activateView() {
    const { workspace } = this.app;

    // Check if the view is already open
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE)[0];

    if (!leaf) {
      // Open in the right sidebar
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: VIEW_TYPE_EXAMPLE,
          active: true,
        });
        leaf = rightLeaf;
      }
    }

    // Reveal the leaf if it exists
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async onunload() {
    // Detach all leaves of this view type when the plugin unloads
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXAMPLE);
  }
}
```

### View Best Practices

- **Always call `detachLeavesOfType()` in `onunload()`** to close your views when the plugin is disabled.
- **Use `workspace.getRightLeaf(false)` or `workspace.getLeaf(false)`** to get a leaf for your view. The `false` parameter means "do not create a new split" -- it reuses an existing empty leaf or creates a new tab.
- **Check for existing leaves** before creating new ones to avoid duplicates.
- **Override `getIcon()`** to provide a recognizable icon for your view in the tab bar.
- **Override `getDisplayText()`** to give a meaningful title for the tab.

### Component Hierarchy with `addChild()`

For complex views with sub-components that need their own lifecycle:

```typescript
class MyView extends ItemView {
  async onOpen() {
    // Create a child component that has its own lifecycle
    const childComponent = new MyChildComponent();
    this.addChild(childComponent);
    childComponent.load();

    // childComponent is automatically unloaded when MyView is closed
  }
}

class MyChildComponent extends Component {
  onload() {
    // Register events, intervals, etc.
    // They are all cleaned up when this component is unloaded
    this.registerInterval(
      window.setInterval(() => this.refresh(), 30000)
    );
  }

  onunload() {
    // Additional custom cleanup if needed
  }
}
```

---

## Appendix A: Plugin Lifecycle Summary

```
Plugin enabled / Obsidian starts
        |
        v
    onload()
        |
        +--> Register commands (addCommand)
        +--> Register views (registerView)
        +--> Register settings tab (addSettingTab)
        +--> Register ribbon icons (addRibbonIcon)
        +--> Register status bar items (addStatusBarItem)
        +--> Register events (registerEvent)
        +--> Register DOM events (registerDomEvent)
        +--> Register intervals (registerInterval)
        +--> Register editor extensions (registerEditorExtension)
        +--> Register custom cleanup (register)
        +--> Add child components (addChild)
        |
        v
    [Plugin is active -- user interacts with it]
        |
        v
Plugin disabled / Obsidian quits
        |
        v
    onunload()
        |
        +--> All registered resources are automatically cleaned up
        +--> All child components are unloaded
        +--> All event handlers are detached
        +--> All DOM event listeners are removed
        +--> All intervals are cleared
        +--> All editor extensions are removed
```

---

## Appendix B: Obsidian October Self-Critique Checklist

Source: https://docs.obsidian.md/oo24/plugin

Use this checklist to review your plugin before submission or after updates:

- [ ] Does the plugin handle errors gracefully without crashing?
- [ ] Are all resources properly cleaned up on unload?
- [ ] Does the plugin work on both desktop and mobile (or is it correctly marked desktop-only)?
- [ ] Does the plugin use CSS variables instead of hardcoded colors?
- [ ] Are DOM elements created securely (no innerHTML with user input)?
- [ ] Does the plugin defer heavy operations until after layout is ready?
- [ ] Are settings saved and loaded correctly with proper default merging?
- [ ] Does the plugin use the Vault API instead of the Adapter API where possible?
- [ ] Are all commands properly conditionally available (using checkCallback)?
- [ ] Does the plugin support pop-out windows correctly?
- [ ] Is `processFrontMatter` used instead of manual YAML parsing?
- [ ] Are event handlers registered via `registerEvent`/`registerDomEvent`?
- [ ] Is the plugin bundle size reasonable (no unnecessary large dependencies)?
- [ ] Does the README clearly describe what the plugin does and how to use it?

---

## Appendix C: Common Patterns Quick Reference

### Pattern: Safe File Operation

```typescript
async safeFileOperation(path: string): Promise<void> {
  const file = this.app.vault.getFileByPath(normalizePath(path));
  if (!file) {
    new Notice(`File not found: ${path}`);
    return;
  }

  try {
    await this.app.vault.process(file, (content) => {
      // Transform content atomically
      return content.replace(/pattern/g, "replacement");
    });
  } catch (e) {
    console.error(`Failed to process ${path}:`, e);
    new Notice(`Failed to update "${file.basename}".`);
  }
}
```

### Pattern: Debounced Settings Save

```typescript
class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  private requestSave = debounce(
    async () => {
      await this.saveData(this.settings);
    },
    500,
    true
  );

  updateSetting<K extends keyof MyPluginSettings>(key: K, value: MyPluginSettings[K]) {
    this.settings[key] = value;
    this.requestSave();
  }
}
```

### Pattern: Singleton View Activation

```typescript
async ensureViewOpen(viewType: string): Promise<void> {
  const existing = this.app.workspace.getLeavesOfType(viewType);
  if (existing.length > 0) {
    this.app.workspace.revealLeaf(existing[0]);
    return;
  }

  const leaf = this.app.workspace.getRightLeaf(false);
  if (leaf) {
    await leaf.setViewState({ type: viewType, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
}
```

### Pattern: Reactive Status Bar Update

```typescript
async onload() {
  const statusBar = this.addStatusBarItem();

  const updateStatus = () => {
    const file = this.app.workspace.getActiveFile();
    if (file) {
      const cache = this.app.metadataCache.getFileCache(file);
      const tags = cache?.tags?.length ?? 0;
      statusBar.setText(`Tags: ${tags}`);
    } else {
      statusBar.setText("");
    }
  };

  this.registerEvent(this.app.workspace.on("active-leaf-change", updateStatus));
  this.registerEvent(this.app.metadataCache.on("changed", updateStatus));
}
```

---

## Appendix D: Key Documentation Links

- **Official Plugin Docs**: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
- **Plugin Guidelines**: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- **Submission Requirements**: https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins
- **Developer Policies**: https://docs.obsidian.md/Developer+policies
- **TypeScript API Reference**: https://docs.obsidian.md/Reference/TypeScript+API
- **CSS Variables Reference**: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
- **API Type Definitions**: https://github.com/obsidianmd/obsidian-api
- **Sample Plugin**: https://github.com/obsidianmd/obsidian-sample-plugin
- **Plugin Load Time Optimization**: https://docs.obsidian.md/Plugins/Guides/Optimizing+plugin+load+time
- **Events Guide**: https://docs.obsidian.md/Plugins/Events
- **Vault API**: https://docs.obsidian.md/Plugins/Vault
- **Editor Extensions**: https://docs.obsidian.md/Plugins/Editor/Editor+extensions
- **State Fields**: https://docs.obsidian.md/Plugins/Editor/State+fields
- **View Plugins**: https://docs.obsidian.md/Plugins/Editor/View+plugins
- **Pop-Out Windows Guide**: https://obsidian.md/blog/how-to-update-plugins-to-support-pop-out-windows/
- **Obsidian October 2024 Checklist**: https://docs.obsidian.md/oo24/plugin
