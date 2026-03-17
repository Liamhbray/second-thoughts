# Obsidian Plugin Production Readiness Guide

A comprehensive offline reference covering everything beyond basic functionality that makes an Obsidian plugin production-ready.

---

## Table of Contents

1. [Testing Strategies](#1-testing-strategies)
2. [Error Handling](#2-error-handling)
3. [Performance Optimization](#3-performance-optimization)
4. [Background Processing Patterns](#4-background-processing-patterns)
5. [Settings Migration](#5-settings-migration)
6. [Data Persistence](#6-data-persistence)
7. [Logging and Debugging](#7-logging-and-debugging)
8. [Accessibility](#8-accessibility)
9. [Internationalization (i18n)](#9-internationalization-i18n)
10. [Security Considerations](#10-security-considerations)
11. [Bundle Size Optimization](#11-bundle-size-optimization)
12. [Monitoring Plugin Health](#12-monitoring-plugin-health)
13. [Graceful Startup and Shutdown](#13-graceful-startup-and-shutdown)
14. [Compatibility Testing Across Obsidian Versions](#14-compatibility-testing-across-obsidian-versions)
15. [Popular Plugin Architectures to Learn From](#15-popular-plugin-architectures-to-learn-from)
16. [CI/CD for Obsidian Plugins](#16-cicd-for-obsidian-plugins)
17. [Documentation Standards](#17-documentation-standards)

---

## 1. Testing Strategies

Testing Obsidian plugins is uniquely challenging because standard test runners (Jest, Vitest, Mocha) load tests dynamically at runtime, but Obsidian plugins are limited to a single `main.js` file. The Obsidian API is not available outside the Electron environment, and many API surfaces are not easily mockable.

### 1.1 Unit Testing with jest-environment-obsidian

The community-maintained `jest-environment-obsidian` package provides a Jest environment with mocked Obsidian API surfaces.

**Installation:**

```bash
npm install --save-dev jest jest-environment-obsidian @types/jest ts-jest
```

**Jest configuration (`jest.config.js`):**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-obsidian',
  testEnvironmentOptions: {
    strictness: 'strict', // 'strict' | 'moderate' | 'lax'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  testMatch: ['**/tests/**/*.test.ts'],
};
```

**Example unit test:**

```typescript
// tests/settings.test.ts
import { DEFAULT_SETTINGS, mergeSettings } from '../src/settings';

describe('Settings', () => {
  it('should merge defaults with partial settings', () => {
    const partial = { apiKey: 'test-key' };
    const result = mergeSettings(partial);
    expect(result.apiKey).toBe('test-key');
    expect(result.refreshInterval).toBe(DEFAULT_SETTINGS.refreshInterval);
  });

  it('should handle empty loaded data', () => {
    const result = mergeSettings(undefined);
    expect(result).toEqual(DEFAULT_SETTINGS);
  });
});
```

**Strictness levels** control how closely the test environment matches real Obsidian behavior:
- `strict` -- functions behave as they do inside Obsidian
- `moderate` -- most behaviors are simulated
- `lax` -- minimal simulation, maximum test speed

### 1.2 Manual Mocking of the Obsidian API

When you need more control, create modular mocks manually:

```typescript
// __mocks__/obsidian.ts
export class Plugin {
  app: any;
  manifest: any;

  async loadData(): Promise<any> {
    return {};
  }

  async saveData(data: any): Promise<void> {}

  addCommand(command: any): any {
    return command;
  }

  addSettingTab(tab: any): void {}

  registerEvent(event: any): void {}

  registerInterval(id: number): number {
    return id;
  }

  addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement {
    return document.createElement('div');
  }
}

export class Notice {
  constructor(public message: string, public timeout?: number) {}
}

export class Modal {
  app: any;
  contentEl = document.createElement('div');
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl = document.createElement('div');
  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl = document.createElement('div');
  constructor(containerEl: HTMLElement) {}
  setName(name: string): this { return this; }
  setDesc(desc: string): this { return this; }
  addText(cb: (text: any) => any): this { return this; }
  addToggle(cb: (toggle: any) => any): this { return this; }
  addDropdown(cb: (dropdown: any) => any): this { return this; }
  addButton(cb: (button: any) => any): this { return this; }
}

export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
  vault: any;
  parent: any;
  stat: any;
}

export class TFolder {
  path: string;
  name: string;
  children: any[];
  parent: any;
  vault: any;
}

export function debounce(fn: Function, delay: number, immediate?: boolean) {
  let timeout: any;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    if (immediate && !timeout) fn.apply(this, args);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}
```

### 1.3 Separating Business Logic from Obsidian API

The most effective testing strategy is to isolate pure logic from Obsidian-dependent code:

```typescript
// src/parser.ts -- pure logic, easy to test
export function parseTaskLine(line: string): { done: boolean; text: string } | null {
  const match = line.match(/^- \[([ xX])\] (.+)$/);
  if (!match) return null;
  return {
    done: match[1] !== ' ',
    text: match[2],
  };
}

// src/plugin.ts -- Obsidian-dependent, thin wrapper
import { Plugin, TFile } from 'obsidian';
import { parseTaskLine } from './parser';

export default class TaskPlugin extends Plugin {
  async getTasksFromFile(file: TFile): Promise<ReturnType<typeof parseTaskLine>[]> {
    const content = await this.app.vault.cachedRead(file);
    return content.split('\n')
      .map(parseTaskLine)
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }
}
```

Now `parseTaskLine` can be tested in any environment without mocking.

### 1.4 Integration Testing Inside Obsidian

The `obsidian-testing` framework by MohrJonas enables integration testing by embedding tests in the plugin itself:

```typescript
// Integration test that runs inside Obsidian
import { Test, TestRunner } from 'obsidian-testing';

@Test('should create a note')
async function testCreateNote(app: App) {
  const file = await app.vault.create('test-note.md', 'Hello World');
  expect(file).toBeDefined();
  expect(file.path).toBe('test-note.md');
  // Cleanup
  await app.vault.delete(file);
}
```

### 1.5 End-to-End Testing with WebdriverIO

The `wdio-obsidian-service` package enables full end-to-end testing with a real Obsidian instance:

```bash
npm install --save-dev @anthropic/wdio-obsidian-service webdriverio
```

### 1.6 Testing in CI

For CI environments, separate pure logic tests (run with Jest/Vitest) from integration tests (require an Obsidian runtime). Run the pure logic tests in CI and integration tests manually or in a specialized pipeline.

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18.x'
      - run: npm install
      - run: npm test
```

### Recommendations

- Architect your plugin to maximize pure-logic code that can be tested without mocking
- Use `jest-environment-obsidian` for tests that need basic Obsidian API mocks
- Create manual mocks for fine-grained control
- Run integration tests manually via the `obsidian-testing` framework or BRAT beta testing
- Keep test coverage on parsers, transformers, and data logic high

---

## 2. Error Handling

### 2.1 The Notice API for User-Facing Errors

Obsidian provides the `Notice` class for displaying non-intrusive messages to users. Use it for errors that the user needs to know about but that are not catastrophic.

```typescript
import { Notice } from 'obsidian';

// Simple notice (auto-dismisses after ~4.5 seconds by default)
new Notice('Settings saved successfully.');

// Notice with custom timeout (in milliseconds)
new Notice('Failed to sync -- will retry in 30 seconds.', 8000);

// Error notice pattern
function showError(message: string, error?: Error): void {
  new Notice(`MyPlugin: ${message}`);
  if (error) {
    console.error(`[MyPlugin] ${message}`, error);
  }
}
```

### 2.2 try/catch Patterns for Async Operations

Every async operation that touches the file system, network, or user data should be wrapped in try/catch:

```typescript
import { Plugin, Notice, TFile } from 'obsidian';

export default class MyPlugin extends Plugin {
  async onload() {
    try {
      await this.loadSettings();
    } catch (error) {
      console.error('[MyPlugin] Failed to load settings, using defaults:', error);
      new Notice('MyPlugin: Failed to load settings. Using defaults.');
      this.settings = { ...DEFAULT_SETTINGS };
    }

    this.addCommand({
      id: 'process-current-file',
      name: 'Process current file',
      callback: () => this.processCurrentFile(),
    });
  }

  async processCurrentFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file to process.');
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const processed = this.transform(content);
      await this.app.vault.modify(file, processed);
      new Notice('File processed successfully.');
    } catch (error) {
      console.error('[MyPlugin] Failed to process file:', error);
      new Notice('MyPlugin: Failed to process file. Check console for details.');
    }
  }
}
```

### 2.3 Null Checks and Defensive Programming

Always check for null/undefined before accessing Obsidian API objects:

```typescript
// BAD: crashes if no file is open
const content = await this.app.vault.read(this.app.workspace.getActiveFile()!);

// GOOD: null-safe
const file = this.app.workspace.getActiveFile();
if (!file) {
  new Notice('Please open a file first.');
  return;
}
if (file.extension !== 'md') {
  new Notice('This command only works on Markdown files.');
  return;
}
const content = await this.app.vault.read(file);
```

### 2.4 Graceful Degradation Patterns

When a feature cannot work, degrade gracefully rather than crashing:

```typescript
async loadExternalData(): Promise<void> {
  try {
    const response = await fetch(this.settings.apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    this.externalData = await response.json();
  } catch (error) {
    console.warn('[MyPlugin] External data unavailable, using cached data:', error);
    // Fall back to cached data or limited functionality
    this.externalData = this.cachedData ?? this.getDefaultData();
    new Notice('MyPlugin: Running in offline mode.');
  }
}
```

### 2.5 Wrapping Event Handlers

Event handlers should never throw uncaught exceptions:

```typescript
this.registerEvent(
  this.app.vault.on('modify', async (file) => {
    try {
      if (file instanceof TFile && file.extension === 'md') {
        await this.handleFileModified(file);
      }
    } catch (error) {
      console.error('[MyPlugin] Error handling file modification:', error);
    }
  })
);
```

### 2.6 Error Boundary for Views

When creating custom views, wrap the render method:

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';

export class MyView extends ItemView {
  async onOpen(): Promise<void> {
    try {
      await this.render();
    } catch (error) {
      console.error('[MyPlugin] View render failed:', error);
      this.contentEl.empty();
      this.contentEl.createEl('p', {
        text: 'Failed to render view. Check console for details.',
        cls: 'my-plugin-error',
      });
    }
  }
}
```

### Recommendations

- Never let exceptions propagate unhandled out of event handlers or commands
- Use `Notice` for user-visible errors; use `console.error` for developer diagnostics
- Always check for null active file, null active leaf, and null editor
- Provide fallback behavior when external services or optional features are unavailable
- Prefix all console messages with your plugin name for easy filtering

---

## 3. Performance Optimization

### 3.1 Deferred Initialization with onLayoutReady

Move heavy startup work out of `onload()` and into `onLayoutReady()` so Obsidian finishes rendering before your plugin does expensive work:

```typescript
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
  async onload() {
    // Lightweight setup only
    await this.loadSettings();
    this.addSettingTab(new MySettingTab(this.app, this));
    this.addCommand({
      id: 'my-command',
      name: 'My Command',
      callback: () => this.runCommand(),
    });

    // Defer heavy initialization
    this.app.workspace.onLayoutReady(this.onLayoutReady.bind(this));
  }

  async onLayoutReady(): Promise<void> {
    // Now safe to do heavy work: index files, build caches, etc.
    await this.buildIndex();
  }
}
```

### 3.2 Debouncing File Events

When listening for vault events like `modify`, debounce to avoid processing every keystroke:

```typescript
import { Plugin, TFile, debounce } from 'obsidian';

export default class MyPlugin extends Plugin {
  // Obsidian provides a built-in debounce function
  private debouncedUpdate = debounce(
    async (file: TFile) => {
      await this.updateIndex(file);
    },
    1000, // Wait 1 second after the last call
    true  // Run on leading edge (optional)
  );

  async onload() {
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.debouncedUpdate(file);
        }
      })
    );
  }
}
```

### 3.3 Chunked Processing for Large Vaults

When processing many files, break work into chunks and yield to the main thread to keep the UI responsive:

```typescript
async processAllFiles(): Promise<void> {
  const files = this.app.vault.getMarkdownFiles();
  const CHUNK_SIZE = 50;

  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);

    for (const file of chunk) {
      await this.processFile(file);
    }

    // Yield to the main thread between chunks
    await new Promise(resolve => setTimeout(resolve, 0));

    // Optional: update progress
    if (this.statusBarEl) {
      this.statusBarEl.setText(
        `Processing: ${Math.min(i + CHUNK_SIZE, files.length)}/${files.length}`
      );
    }
  }
}
```

### 3.4 Using requestIdleCallback

For truly background work that should only happen when the browser is idle:

```typescript
function processInIdleTime(
  tasks: (() => void)[],
  onComplete?: () => void
): void {
  let index = 0;

  function processNext(deadline: IdleDeadline): void {
    while (index < tasks.length && deadline.timeRemaining() > 1) {
      tasks[index]();
      index++;
    }

    if (index < tasks.length) {
      requestIdleCallback(processNext);
    } else {
      onComplete?.();
    }
  }

  requestIdleCallback(processNext);
}

// Usage
const fileTasks = files.map(file => () => this.indexFile(file));
processInIdleTime(fileTasks, () => {
  console.log('[MyPlugin] Indexing complete');
});
```

### 3.5 Caching with cachedRead

Prefer `vault.cachedRead()` over `vault.read()` for better performance when you do not need guaranteed-fresh content:

```typescript
// vault.read() -- always reads from disk
// vault.cachedRead() -- returns cached content if available (faster)
const content = await this.app.vault.cachedRead(file);
```

### 3.6 Lazy Loading Heavy Dependencies

Import large modules only when they are actually needed:

```typescript
// BAD: imports heavy library at plugin load
import markdownit from 'markdown-it';

// GOOD: import dynamically when first needed
let md: any;
async function getMarkdownIt() {
  if (!md) {
    md = (await import('markdown-it')).default();
  }
  return md;
}
```

### 3.7 Using requestAnimationFrame for DOM Updates

When updating the DOM frequently, batch updates with `requestAnimationFrame`:

```typescript
private pendingUpdate = false;

requestRender(): void {
  if (this.pendingUpdate) return;
  this.pendingUpdate = true;

  requestAnimationFrame(() => {
    this.render();
    this.pendingUpdate = false;
  });
}
```

### Recommendations

- Always use `onLayoutReady` for work that does not need to happen before the workspace appears
- Debounce all vault event handlers -- the Obsidian `debounce` function is available as a direct import
- For vaults with thousands of files, process in chunks with `setTimeout(resolve, 0)` between them
- Use `cachedRead` unless you need the absolute latest content from disk
- Lazy-load heavy dependencies via dynamic `import()`

---

## 4. Background Processing Patterns

### 4.1 registerInterval

Use `this.registerInterval()` to create intervals that are automatically cleaned up when the plugin unloads. This is critical for preventing memory leaks:

```typescript
import { Plugin, moment } from 'obsidian';

export default class MyPlugin extends Plugin {
  async onload() {
    // Registered intervals are automatically cleared on plugin unload
    this.registerInterval(
      window.setInterval(() => this.periodicSync(), 5 * 60 * 1000) // Every 5 minutes
    );
  }

  async periodicSync(): Promise<void> {
    try {
      await this.syncData();
    } catch (error) {
      console.error('[MyPlugin] Periodic sync failed:', error);
    }
  }
}
```

### 4.2 registerEvent for Automatic Cleanup

All event listeners registered via `registerEvent` are automatically unsubscribed on unload:

```typescript
async onload() {
  // Vault events
  this.registerEvent(
    this.app.vault.on('create', (file) => {
      if (file instanceof TFile) {
        this.onFileCreated(file);
      }
    })
  );

  // Workspace events
  this.registerEvent(
    this.app.workspace.on('file-open', (file) => {
      if (file) {
        this.onFileOpened(file);
      }
    })
  );

  // DOM events with automatic cleanup
  this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    this.handleGlobalClick(evt);
  });
}
```

### 4.3 register() for Custom Cleanup

Use `this.register()` to register arbitrary cleanup callbacks:

```typescript
async onload() {
  const observer = new MutationObserver((mutations) => {
    this.handleMutations(mutations);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Will be called automatically when plugin unloads
  this.register(() => observer.disconnect());
}
```

### 4.4 Yielding to the Main Thread

For long-running computations, periodically yield control back to the event loop:

```typescript
async processLargeDataset(items: any[]): Promise<void> {
  const BATCH_SIZE = 100;

  for (let i = 0; i < items.length; i++) {
    this.processItem(items[i]);

    // Yield every BATCH_SIZE items
    if (i % BATCH_SIZE === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
```

### 4.5 Web Workers (Experimental)

Web Workers can offload CPU-intensive work to a background thread, but support in Obsidian has been inconsistent. Some plugin versions encounter "Worker is not a constructor" errors. If you attempt Web Workers, use the inline worker pattern:

```typescript
// esbuild.config.mjs -- add worker entry point
// This approach requires careful esbuild configuration

function createInlineWorker(workerCode: string): Worker {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  // Cleanup the blob URL
  worker.addEventListener('error', () => URL.revokeObjectURL(url));

  return worker;
}
```

Recommendation: prefer `requestIdleCallback` and chunked processing over Web Workers for most use cases due to reliability concerns.

### 4.6 requestIdleCallback with Timeout

For background indexing that should complete in finite time:

```typescript
function scheduleIdleWork(
  work: () => boolean, // returns true when done
  timeout: number = 5000
): Promise<void> {
  return new Promise((resolve) => {
    function doWork(deadline: IdleDeadline): void {
      while (deadline.timeRemaining() > 1 || deadline.didTimeout) {
        if (work()) {
          resolve();
          return;
        }
        if (deadline.timeRemaining() <= 1) break;
      }
      requestIdleCallback(doWork, { timeout });
    }
    requestIdleCallback(doWork, { timeout });
  });
}
```

### Recommendations

- Always use `registerInterval`, `registerEvent`, and `registerDomEvent` -- never raw `setInterval`/`addEventListener`
- Use `this.register(() => ...)` for any custom cleanup
- Prefer `requestIdleCallback` or chunked `setTimeout` over Web Workers
- Wrap all background callbacks in try/catch

---

## 5. Settings Migration

Obsidian does not provide a built-in settings migration system. You must implement versioned settings yourself.

### 5.1 Versioned Settings Schema

Add a `settingsVersion` field to your settings interface:

```typescript
interface MyPluginSettings {
  settingsVersion: number;
  // v1 fields
  apiKey: string;
  refreshInterval: number;
  // v2 fields (added later)
  theme: 'light' | 'dark' | 'auto';
  // v3 fields (renamed/restructured)
  syncOptions: {
    enabled: boolean;
    intervalMinutes: number;
  };
}

const CURRENT_SETTINGS_VERSION = 3;

const DEFAULT_SETTINGS: MyPluginSettings = {
  settingsVersion: CURRENT_SETTINGS_VERSION,
  apiKey: '',
  refreshInterval: 300,
  theme: 'auto',
  syncOptions: {
    enabled: false,
    intervalMinutes: 30,
  },
};
```

### 5.2 Migration Functions

Define a chain of migration functions, each upgrading from one version to the next:

```typescript
type MigrationFn = (data: any) => any;

const migrations: Record<number, MigrationFn> = {
  // Migrate from v1 to v2: add 'theme' field
  1: (data: any) => {
    return {
      ...data,
      theme: 'auto',
      settingsVersion: 2,
    };
  },

  // Migrate from v2 to v3: restructure sync settings
  2: (data: any) => {
    const { syncEnabled, syncInterval, ...rest } = data;
    return {
      ...rest,
      syncOptions: {
        enabled: syncEnabled ?? false,
        intervalMinutes: syncInterval ?? 30,
      },
      settingsVersion: 3,
    };
  },
};

function migrateSettings(data: any): MyPluginSettings {
  let current = data;
  let version = current.settingsVersion ?? 1; // default to v1 if missing

  while (version < CURRENT_SETTINGS_VERSION) {
    const migrator = migrations[version];
    if (!migrator) {
      console.error(`[MyPlugin] No migration for settings version ${version}`);
      break;
    }
    console.log(`[MyPlugin] Migrating settings from v${version} to v${version + 1}`);
    current = migrator(current);
    version = current.settingsVersion;
  }

  return current;
}
```

### 5.3 Integrating Migration into loadSettings

```typescript
async loadSettings(): Promise<void> {
  const loaded = await this.loadData();

  if (!loaded) {
    // First install -- use defaults
    this.settings = { ...DEFAULT_SETTINGS };
  } else if (loaded.settingsVersion === CURRENT_SETTINGS_VERSION) {
    // Current version -- merge with defaults for any new fields
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  } else {
    // Needs migration
    this.settings = migrateSettings(loaded);
    // Persist the migrated settings immediately
    await this.saveSettings();
    new Notice('MyPlugin: Settings have been updated to the latest format.');
  }
}
```

### Recommendations

- Always include a `settingsVersion` field from your first release
- Keep migration functions simple and ordered sequentially
- Test migration functions with unit tests covering each version transition
- Save settings immediately after migration
- Notify the user when settings have been migrated
- Never delete old fields in the stored data -- only add/rename in the migration

---

## 6. Data Persistence

### 6.1 saveData / loadData Basics

Obsidian provides `this.loadData()` and `this.saveData()` on the Plugin class. These read/write JSON to `<vault>/.obsidian/plugins/<plugin-id>/data.json`.

```typescript
// Standard pattern
async loadSettings(): Promise<void> {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings(): Promise<void> {
  await this.saveData(this.settings);
}
```

Important: both `loadData` and `saveData` are async. Always `await` them.

### 6.2 When to Use data.json vs Custom Files

**Use `data.json` (via saveData/loadData) for:**
- User settings and preferences
- Small amounts of state (< 1 MB)
- Configuration that should travel with the vault

**Use custom files for:**
- Large datasets (indexes, caches, embeddings)
- Data that users might want to inspect or edit
- Data that benefits from incremental writes
- Binary data

```typescript
// Writing a custom JSON file to the plugin directory
import { normalizePath } from 'obsidian';

async saveIndex(index: Record<string, any>): Promise<void> {
  const path = normalizePath(
    `${this.manifest.dir}/index-cache.json`
  );
  const data = JSON.stringify(index);
  await this.app.vault.adapter.write(path, data);
}

async loadIndex(): Promise<Record<string, any> | null> {
  const path = normalizePath(
    `${this.manifest.dir}/index-cache.json`
  );
  try {
    const data = await this.app.vault.adapter.read(path);
    return JSON.parse(data);
  } catch {
    return null;
  }
}
```

### 6.3 Size Considerations

- `data.json` is loaded entirely into memory. Keep it under 1 MB.
- For large caches, use the vault adapter to write to separate files in the plugin directory.
- Consider splitting large data into multiple files (e.g., one file per indexed note).
- On mobile, Obsidian may kill the app in the background at any time, so persist important data promptly.

### 6.4 Debouncing Saves

If settings or data change frequently, debounce saves to avoid excessive disk I/O:

```typescript
import { debounce } from 'obsidian';

// In your plugin class
private debouncedSave = debounce(
  async () => {
    await this.saveData(this.settings);
  },
  2000,
  false
);

// Call this instead of saveSettings() for frequent updates
onSettingChanged(): void {
  this.debouncedSave();
}
```

### 6.5 Atomic-Style Writes

For critical data, consider a write-then-rename pattern to prevent corruption:

```typescript
async safeWriteData(filename: string, data: string): Promise<void> {
  const tempPath = normalizePath(`${this.manifest.dir}/${filename}.tmp`);
  const finalPath = normalizePath(`${this.manifest.dir}/${filename}`);

  // Write to temp file first
  await this.app.vault.adapter.write(tempPath, data);

  // Remove old file if it exists
  if (await this.app.vault.adapter.exists(finalPath)) {
    await this.app.vault.adapter.remove(finalPath);
  }

  // Rename temp to final
  await this.app.vault.adapter.rename(tempPath, finalPath);
}
```

### Recommendations

- Always `await` loadData/saveData
- Use `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())` to handle missing fields gracefully
- Keep `data.json` small -- offload large data to separate files
- Debounce frequent saves
- On mobile, save data eagerly since the app can be killed without notice

---

## 7. Logging and Debugging

### 7.1 Console Logging Patterns

Since Obsidian is an Electron app, `console.log/warn/error/debug` output to the Chromium DevTools console (Ctrl+Shift+I / Cmd+Option+I).

```typescript
// Prefix all messages with plugin name for filtering
const LOG_PREFIX = '[MyPlugin]';

function logDebug(...args: any[]): void {
  if (DEBUG_MODE) {
    console.debug(LOG_PREFIX, ...args);
  }
}

function logInfo(...args: any[]): void {
  console.log(LOG_PREFIX, ...args);
}

function logWarn(...args: any[]): void {
  console.warn(LOG_PREFIX, ...args);
}

function logError(...args: any[]): void {
  console.error(LOG_PREFIX, ...args);
}
```

### 7.2 Debug Mode Setting

Implement a debug mode that users can toggle for troubleshooting:

```typescript
interface MyPluginSettings {
  debugMode: boolean;
  // ... other settings
}

class PluginLogger {
  constructor(private pluginName: string, private isDebug: () => boolean) {}

  debug(...args: any[]): void {
    if (this.isDebug()) {
      console.debug(`[${this.pluginName}]`, ...args);
    }
  }

  info(...args: any[]): void {
    console.log(`[${this.pluginName}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.pluginName}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[${this.pluginName}]`, ...args);
  }

  time(label: string): void {
    if (this.isDebug()) {
      console.time(`[${this.pluginName}] ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.isDebug()) {
      console.timeEnd(`[${this.pluginName}] ${label}`);
    }
  }
}

// Usage in plugin
export default class MyPlugin extends Plugin {
  logger: PluginLogger;

  async onload() {
    this.logger = new PluginLogger('MyPlugin', () => this.settings.debugMode);
    this.logger.debug('Plugin loading...');
    this.logger.time('onload');
    // ... initialization
    this.logger.timeEnd('onload');
  }
}
```

### 7.3 Performance Measurement

```typescript
// Measure specific operations
async indexVault(): Promise<void> {
  const start = performance.now();
  const files = this.app.vault.getMarkdownFiles();

  for (const file of files) {
    await this.indexFile(file);
  }

  const elapsed = performance.now() - start;
  this.logger.info(`Indexed ${files.length} files in ${elapsed.toFixed(0)}ms`);
}
```

### 7.4 Opening Developer Tools

Users can open the developer console:
- **Windows/Linux:** Ctrl + Shift + I
- **macOS:** Cmd + Option + I
- Obsidian also has a command: "Toggle Developer Tools"

### 7.5 Community Debugging Plugins

- **Logstravaganza** -- proxies `console.*()` calls and copies log messages and uncaught exceptions to a note in the vault
- **Notice Logger** -- logs all Obsidian Notice messages to the developer console with timestamps
- **vConsole** -- provides an in-app developer console for mobile debugging

### 7.6 Hot Reload for Development

Use the `hot-reload` plugin by pjeby during development. It automatically reloads your plugin when `main.js` changes, eliminating manual reload cycles.

### Recommendations

- Always prefix console output with your plugin name in square brackets
- Provide a "Debug Mode" toggle in settings that gates verbose logging
- Use `console.time` / `console.timeEnd` for performance profiling
- Never leave verbose logging on by default in production
- Use `performance.now()` for accurate timing measurements

---

## 8. Accessibility

### 8.1 Keyboard Navigation

Ensure all interactive elements in your plugin are keyboard-accessible:

```typescript
import { Setting } from 'obsidian';

// Settings already handle keyboard navigation through the Setting API
new Setting(containerEl)
  .setName('My Option')
  .setDesc('Description of the option')
  .addToggle(toggle => {
    toggle
      .setValue(this.plugin.settings.myOption)
      .onChange(async (value) => {
        this.plugin.settings.myOption = value;
        await this.plugin.saveSettings();
      });
  });
```

For custom UI elements, ensure focusability:

```typescript
// Make custom interactive elements keyboard-navigable
const button = containerEl.createEl('button', {
  text: 'Click me',
  cls: 'my-plugin-button',
});
button.tabIndex = 0;
button.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    this.handleButtonClick();
  }
});
```

### 8.2 ARIA Attributes

Add ARIA attributes to custom UI components:

```typescript
// For custom dropdowns or interactive panels
function createAccessiblePanel(container: HTMLElement): HTMLElement {
  const panel = container.createDiv({ cls: 'my-plugin-panel' });
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Plugin Results');

  const list = panel.createEl('ul', { cls: 'result-list' });
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Search results');

  return panel;
}

function addResultItem(list: HTMLElement, text: string, index: number): void {
  const item = list.createEl('li', { text });
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', 'false');
  item.tabIndex = 0;
  item.id = `result-${index}`;
}
```

### 8.3 Focus Management in Modals

```typescript
import { Modal, App } from 'obsidian';

class AccessibleModal extends Modal {
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'My Modal' });

    const input = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'Enter value...',
    });
    input.setAttribute('aria-label', 'Enter value');

    // Focus the first interactive element
    setTimeout(() => input.focus(), 50);

    // Handle Escape key (Modal already does this, but for custom elements)
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }
}
```

### 8.4 Screen Reader Considerations

```typescript
// Provide text alternatives for icons
const iconButton = containerEl.createEl('button', { cls: 'clickable-icon' });
iconButton.setAttribute('aria-label', 'Refresh data');
iconButton.innerHTML = '<svg>...</svg>'; // icon only -- needs aria-label

// Live regions for dynamic content
const statusArea = containerEl.createDiv({ cls: 'status' });
statusArea.setAttribute('aria-live', 'polite');
statusArea.setAttribute('aria-atomic', 'true');

// Update status -- screen readers will announce the change
function updateStatus(el: HTMLElement, message: string): void {
  el.setText(message);
}
```

### 8.5 Color Contrast and Visual Design

```css
/* Use Obsidian CSS variables for consistent theming */
.my-plugin-container {
  color: var(--text-normal);
  background-color: var(--background-primary);
}

.my-plugin-error {
  color: var(--text-error);
}

.my-plugin-muted {
  color: var(--text-muted);
}

/* Visible focus indicators */
.my-plugin-button:focus-visible {
  outline: 2px solid var(--interactive-accent);
  outline-offset: 2px;
}
```

### Recommendations

- Use Obsidian's built-in `Setting` API for settings UI -- it handles keyboard and accessibility
- Add `aria-label` to icon-only buttons
- Ensure all interactive elements have `tabIndex` and keyboard event handlers
- Use `aria-live` regions for dynamically updating content
- Use Obsidian CSS variables for theming to ensure contrast in both light and dark themes
- Test with keyboard-only navigation (no mouse)

---

## 9. Internationalization (i18n)

Obsidian does not provide an official i18n framework for plugins. The community has adopted several approaches.

### 9.1 Detecting Obsidian's Language

```typescript
// Get the current Obsidian locale
function getObsidianLocale(): string {
  // The locale is available through the moment library
  return moment.locale(); // e.g., 'en', 'de', 'ja', 'zh-cn'
}

// Alternative: read from Obsidian's internal config
function getObsidianLanguage(): string {
  // @ts-ignore -- not in public API
  return window.localStorage.getItem('language') || 'en';
}
```

### 9.2 Simple Translation Map Pattern

For plugins with modest UI text, a lightweight translation map works well:

```typescript
// src/i18n/index.ts
import en from './locales/en';
import de from './locales/de';
import ja from './locales/ja';
import zhCN from './locales/zh-cn';

const locales: Record<string, Record<string, string>> = {
  en,
  de,
  ja,
  'zh-cn': zhCN,
};

let currentLocale = 'en';

export function setLocale(locale: string): void {
  currentLocale = locale in locales ? locale : 'en';
}

export function t(key: string, vars?: Record<string, string>): string {
  let text = locales[currentLocale]?.[key]
    ?? locales['en']?.[key]
    ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{{${k}}}`, v);
    }
  }

  return text;
}
```

```typescript
// src/i18n/locales/en.ts
export default {
  'settings.title': 'My Plugin Settings',
  'settings.apiKey': 'API Key',
  'settings.apiKeyDesc': 'Enter your API key for authentication',
  'command.process': 'Process current file',
  'notice.success': 'Processed {{count}} items successfully',
  'notice.error': 'Failed to process file',
  'notice.noFile': 'No active file',
};
```

```typescript
// src/i18n/locales/de.ts
export default {
  'settings.title': 'Meine Plugin-Einstellungen',
  'settings.apiKey': 'API-Schluessel',
  'settings.apiKeyDesc': 'Geben Sie Ihren API-Schluessel zur Authentifizierung ein',
  'command.process': 'Aktuelle Datei verarbeiten',
  'notice.success': '{{count}} Elemente erfolgreich verarbeitet',
  'notice.error': 'Datei konnte nicht verarbeitet werden',
  'notice.noFile': 'Keine aktive Datei',
};
```

### 9.3 Initializing i18n in the Plugin

```typescript
import { Plugin } from 'obsidian';
import { setLocale, t } from './i18n';

export default class MyPlugin extends Plugin {
  async onload() {
    // Set locale based on Obsidian's language
    setLocale(moment.locale());

    this.addCommand({
      id: 'process-file',
      name: t('command.process'),
      callback: () => this.processFile(),
    });
  }

  async processFile(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice(t('notice.noFile'));
      return;
    }
    // ... processing
    new Notice(t('notice.success', { count: '42' }));
  }
}
```

### 9.4 Using i18next (Heavier Approach)

For plugins with extensive UI, `i18next` provides more features (pluralization, interpolation, nesting):

```typescript
import i18next from 'i18next';

await i18next.init({
  lng: moment.locale(),
  fallbackLng: 'en',
  resources: {
    en: { translation: require('./locales/en.json') },
    de: { translation: require('./locales/de.json') },
  },
});

// Usage
i18next.t('settings.title');
i18next.t('notice.success', { count: 42 }); // handles pluralization
```

Note: using i18next adds to your bundle size. The simple map pattern is usually sufficient.

### Recommendations

- Use `moment.locale()` to detect Obsidian's configured language
- For most plugins, the simple translation map pattern is sufficient
- Always provide English as the fallback language
- Accept community contributions for translations via JSON files
- Commands registered with `addCommand` use the `name` string at registration time, so re-register if language changes mid-session

---

## 10. Security Considerations

### 10.1 Avoiding innerHTML and XSS

Never insert user-controlled strings via `innerHTML`, `outerHTML`, or `insertAdjacentHTML`:

```typescript
// DANGEROUS -- XSS vulnerability
function renderUserContent(container: HTMLElement, userInput: string): void {
  container.innerHTML = `<div>${userInput}</div>`;
  // userInput could be: <img src=x onerror="alert('XSS')">
}

// SAFE -- use Obsidian's DOM helpers
function renderUserContentSafe(container: HTMLElement, userInput: string): void {
  container.empty();
  const div = container.createDiv();
  div.createSpan({ text: userInput }); // text content is auto-escaped
}
```

### 10.2 Using createEl, createDiv, createSpan

Obsidian provides safe DOM creation helpers that properly escape content:

```typescript
// Creating elements safely
const container = this.contentEl.createDiv({ cls: 'my-plugin-results' });

container.createEl('h3', { text: 'Results' });
container.createEl('p', { text: userProvidedText }); // safe: text is escaped

const link = container.createEl('a', {
  text: 'Click here',
  href: sanitizedUrl,
  cls: 'external-link',
});
link.setAttr('target', '_blank');
link.setAttr('rel', 'noopener noreferrer');

const list = container.createEl('ul');
for (const item of items) {
  list.createEl('li', { text: item.name }); // safe
}
```

### 10.3 sanitizeHTMLToDom

When you must render HTML (e.g., rendering markdown output), use Obsidian's built-in sanitizer:

```typescript
import { sanitizeHTMLToDom } from 'obsidian';

// sanitizeHTMLToDom uses DOMPurify internally
function renderSanitizedHTML(container: HTMLElement, html: string): void {
  container.empty();
  const fragment = sanitizeHTMLToDom(html);
  container.appendChild(fragment);
}
```

You can also access DOMPurify directly:

```typescript
// DOMPurify is available globally in Obsidian
// @ts-ignore
const clean = window.DOMPurify.sanitize(dirtyHTML, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
});
```

### 10.4 Sanitizing URLs

```typescript
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'obsidian:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeUrl(url: string): string {
  if (!isValidUrl(url)) {
    return '#';
  }
  return url;
}
```

### 10.5 Handling External Data

```typescript
// Always validate data from external APIs
async fetchExternalData(): Promise<void> {
  const response = await fetch(this.settings.apiEndpoint);
  const data = await response.json();

  // Validate structure before using
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid response format');
  }

  // Never render raw API responses as HTML
  if (data.description) {
    this.renderText(data.description); // use createEl, not innerHTML
  }
}
```

### 10.6 File Path Safety

```typescript
import { normalizePath } from 'obsidian';

// Always normalize file paths to prevent directory traversal
function safeFilePath(basePath: string, userInput: string): string {
  const normalized = normalizePath(userInput);
  // Ensure the path does not escape the base directory
  if (normalized.startsWith('..') || normalized.includes('/../')) {
    throw new Error('Invalid file path');
  }
  return normalizePath(`${basePath}/${normalized}`);
}
```

### Recommendations

- Never use `innerHTML` with user-provided content
- Use `createEl`, `createDiv`, `createSpan` for safe DOM creation
- Use `sanitizeHTMLToDom` when you must render HTML
- Validate and sanitize all URLs before rendering
- Validate external API responses before using them
- Use `normalizePath` for all file paths
- Add `rel="noopener noreferrer"` and `target="_blank"` to external links

---

## 11. Bundle Size Optimization

### 11.1 Standard esbuild Configuration

The official Obsidian sample plugin uses this esbuild configuration:

```javascript
// esbuild.config.mjs
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  banner: {
    js: banner,
  },
  entryPoints: ['src/main.ts'],
  bundle: true,
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
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

### 11.2 External Packages

The `external` array is critical. These packages are provided by Obsidian at runtime and must not be bundled:

- `obsidian` -- the entire Obsidian API
- `electron` -- Electron APIs
- `@codemirror/*` -- CodeMirror 6 packages (used by Obsidian's editor)
- `@lezer/*` -- Lezer parser packages
- `builtin-modules` -- Node.js built-in modules

### 11.3 Tree Shaking

esbuild's tree shaking removes unused code. To maximize its effectiveness:

```typescript
// BAD: imports entire library
import _ from 'lodash';
const result = _.debounce(fn, 100);

// GOOD: import only what you need
import debounce from 'lodash/debounce';
const result = debounce(fn, 100);

// BETTER: use Obsidian's built-in debounce
import { debounce } from 'obsidian';
```

### 11.4 Avoiding Large Dependencies

Common bloat sources and alternatives:

| Heavy Dependency | Bundle Cost | Alternative |
|---|---|---|
| `lodash` (full) | ~70 KB | Import individual functions, or use native JS |
| `moment` (bundled) | ~70 KB | Use Obsidian's built-in `moment` import |
| `axios` | ~13 KB | Use native `fetch` (available in Obsidian) |
| `uuid` | ~3 KB | Use `crypto.randomUUID()` |
| `markdown-it` | ~90 KB | Use Obsidian's `MarkdownRenderer.render()` |
| `DOMPurify` | ~18 KB | Use `sanitizeHTMLToDom` or `window.DOMPurify` |

```typescript
// Use Obsidian's built-in moment instead of bundling your own
import { moment } from 'obsidian';
const now = moment().format('YYYY-MM-DD');

// Use Obsidian's MarkdownRenderer instead of markdown-it
import { MarkdownRenderer, Component } from 'obsidian';
await MarkdownRenderer.render(
  this.app,
  markdownText,
  containerEl,
  sourcePath,
  new Component()
);
```

### 11.5 Analyzing Bundle Size

```bash
# Build with metafile to analyze
npx esbuild src/main.ts --bundle --outfile=main.js --metafile=meta.json \
  --external:obsidian --external:electron --format=cjs

# Analyze with esbuild's visualizer
# Open https://esbuild.github.io/analyze/ and upload meta.json
```

### 11.6 Dynamic Imports for Optional Features

```typescript
// Only load heavy code when the feature is used
async showChart(): Promise<void> {
  const { Chart } = await import('chart.js/auto');
  // Chart is only loaded when this method is called
  new Chart(canvas, config);
}
```

### Recommendations

- Always mark `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` as external
- Enable `treeShaking: true` and `minify: true` for production
- Use Obsidian's built-in `moment`, `DOMPurify`, and `MarkdownRenderer` instead of bundling duplicates
- Prefer native browser APIs (`fetch`, `crypto.randomUUID()`) over npm packages
- Use dynamic imports for features used infrequently
- Analyze your bundle with esbuild's metafile to find bloat

---

## 12. Monitoring Plugin Health

### 12.1 Global Error Handler

Catch unhandled errors from your plugin's async operations:

```typescript
export default class MyPlugin extends Plugin {
  private errorCount = 0;
  private readonly MAX_ERRORS = 10;

  async onload() {
    // Wrap critical operations with the error counter
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        await this.safeExecute(() => this.handleModify(file));
      })
    );
  }

  private async safeExecute(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      // Reset error count on success
      this.errorCount = 0;
    } catch (error) {
      this.errorCount++;
      console.error('[MyPlugin] Error:', error);

      if (this.errorCount >= this.MAX_ERRORS) {
        console.error('[MyPlugin] Too many errors, disabling feature');
        new Notice('MyPlugin: Feature disabled due to repeated errors. Check console.');
        // Disable the problematic feature rather than crashing
        this.disableFeature();
      }
    }
  }
}
```

### 12.2 Health Check Status Bar

```typescript
export default class MyPlugin extends Plugin {
  private statusBarEl: HTMLElement;
  private isHealthy = true;

  async onload() {
    this.statusBarEl = this.addStatusBarItem();
    this.updateHealthStatus();
  }

  private updateHealthStatus(): void {
    if (this.isHealthy) {
      this.statusBarEl.setText('MyPlugin: OK');
      this.statusBarEl.style.color = '';
    } else {
      this.statusBarEl.setText('MyPlugin: Error');
      this.statusBarEl.style.color = 'var(--text-error)';
    }
  }

  private markUnhealthy(reason: string): void {
    this.isHealthy = false;
    this.updateHealthStatus();
    console.error(`[MyPlugin] Unhealthy: ${reason}`);
  }
}
```

### 12.3 Startup Performance Monitoring

Obsidian can measure plugin startup time. Users can enable this in Settings > Community Plugins. As a developer, you can self-report:

```typescript
async onload() {
  const startTime = performance.now();

  // ... initialization ...

  const loadTime = performance.now() - startTime;
  console.log(`[MyPlugin] Loaded in ${loadTime.toFixed(0)}ms`);

  if (loadTime > 1000) {
    console.warn(`[MyPlugin] Slow startup detected (${loadTime.toFixed(0)}ms)`);
  }
}
```

### 12.4 Circuit Breaker for External Services

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeout: number = 60000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }
}
```

### Recommendations

- Track error counts and disable features after repeated failures
- Log startup performance and warn if it exceeds 1 second
- Use a circuit breaker for external API calls
- Provide visual health indicators in the status bar for long-running plugins
- Never let a plugin error crash Obsidian -- degrade gracefully

---

## 13. Graceful Startup and Shutdown

### 13.1 The Plugin Lifecycle

```typescript
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
  private indexReady = false;
  private shutdownRequested = false;

  async onload() {
    // Phase 1: Synchronous, fast setup
    await this.loadSettings();
    this.addSettingTab(new MySettingTab(this.app, this));
    this.registerCommands();

    // Phase 2: Deferred heavy work
    this.app.workspace.onLayoutReady(async () => {
      await this.deferredInit();
    });
  }

  private async deferredInit(): Promise<void> {
    try {
      await this.buildIndex();
      this.indexReady = true;
      this.logger.info('Index ready');
    } catch (error) {
      this.logger.error('Failed to build index:', error);
      new Notice('MyPlugin: Indexing failed. Some features may be unavailable.');
    }
  }

  onunload() {
    // Called when plugin is disabled (NOT when Obsidian closes)
    this.shutdownRequested = true;

    // Clean up any resources not managed by registerX()
    this.cancelPendingOperations();

    // Registered events, intervals, and DOM events are cleaned up automatically
    console.log('[MyPlugin] Unloaded');
  }
}
```

### 13.2 Important: onunload is NOT Called on App Close

`onunload()` is called when a plugin is disabled or when Obsidian performs a hot-reload, but **not** when the user closes Obsidian. This means:

- Do not rely on `onunload` for critical data persistence
- Save important state eagerly (immediately when it changes)
- On mobile, the app can be killed at any time without warning

```typescript
// Save immediately when critical state changes
async updateCriticalState(newState: CriticalState): Promise<void> {
  this.state = newState;
  // Don't wait -- save now
  await this.saveData(this.state);
}

// For less critical data, debounce is fine
private debouncedSave = debounce(async () => {
  await this.saveData(this.settings);
}, 2000, false);
```

### 13.3 Handling Interrupted Operations

```typescript
private processingAbortController: AbortController | null = null;

async processVault(): Promise<void> {
  // Cancel any in-progress processing
  this.processingAbortController?.abort();
  this.processingAbortController = new AbortController();
  const { signal } = this.processingAbortController;

  const files = this.app.vault.getMarkdownFiles();
  for (const file of files) {
    if (signal.aborted) {
      console.log('[MyPlugin] Processing cancelled');
      return;
    }
    await this.processFile(file);
  }
}

onunload() {
  this.processingAbortController?.abort();
}
```

### 13.4 Crash Recovery

Since plugins can crash mid-operation, design data writes to be recoverable:

```typescript
async onload() {
  await this.loadSettings();

  // Check for incomplete operations from a previous crash
  if (this.settings._operationInProgress) {
    console.warn('[MyPlugin] Detected incomplete operation from previous session');
    this.settings._operationInProgress = false;
    await this.saveSettings();
    // Re-run the interrupted operation
    this.app.workspace.onLayoutReady(async () => {
      await this.recoverFromCrash();
    });
  }
}

async performCriticalOperation(): Promise<void> {
  this.settings._operationInProgress = true;
  await this.saveSettings();

  try {
    await this.doWork();
  } finally {
    this.settings._operationInProgress = false;
    await this.saveSettings();
  }
}
```

### Recommendations

- Split `onload` into fast synchronous setup and deferred heavy work via `onLayoutReady`
- Never rely on `onunload` for critical persistence -- it is not called on app close
- Use `AbortController` to cancel long-running operations during unload
- Implement crash recovery by tracking in-progress operations in saved data
- Save critical data immediately, not in a deferred or debounced manner

---

## 14. Compatibility Testing Across Obsidian Versions

### 14.1 manifest.json and minAppVersion

The `minAppVersion` field in `manifest.json` declares the minimum Obsidian version your plugin supports:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.2.0",
  "minAppVersion": "1.0.0",
  "author": "Your Name",
  "description": "A description of your plugin",
  "authorUrl": "https://github.com/yourname",
  "isDesktopOnly": false
}
```

Obsidian compares `minAppVersion` against the installation's `apiVersion` to determine compatibility.

### 14.2 versions.json

The `versions.json` file maps your plugin versions to their minimum required Obsidian versions. This allows users on older Obsidian to install older compatible plugin versions:

```json
{
  "1.0.0": "0.15.0",
  "1.1.0": "0.16.0",
  "1.2.0": "1.0.0"
}
```

### 14.3 The version-bump.mjs Script

The official sample plugin includes this script to keep versions in sync:

```javascript
// version-bump.mjs
import { readFileSync, writeFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// Read and update manifest.json
let manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));

// Update versions.json
let versions = JSON.parse(readFileSync('versions.json', 'utf8'));
versions[targetVersion] = minAppVersion;
writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));
```

Configure it in `package.json`:

```json
{
  "scripts": {
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  }
}
```

Now `npm version patch` (or `minor`/`major`) automatically updates all three files.

### 14.4 Checking API Availability at Runtime

When using newer API features, check for their existence:

```typescript
// Check if a newer API method exists before calling it
if (typeof this.app.vault.process === 'function') {
  await this.app.vault.process(file, (data) => {
    return data.replace(oldText, newText);
  });
} else {
  // Fallback for older Obsidian versions
  const content = await this.app.vault.read(file);
  await this.app.vault.modify(file, content.replace(oldText, newText));
}
```

### 14.5 Desktop vs Mobile

```json
{
  "isDesktopOnly": false
}
```

Set `isDesktopOnly` to `true` if your plugin uses Node.js APIs, Electron APIs, or filesystem operations not available on mobile. If false, test on both desktop and mobile.

```typescript
import { Platform } from 'obsidian';

if (Platform.isMobile) {
  // Adjust behavior for mobile
  this.settings.batchSize = 20; // smaller batches
} else {
  this.settings.batchSize = 100;
}

if (Platform.isDesktop) {
  // Desktop-only features
  this.addCommand({
    id: 'open-in-system',
    name: 'Open in system file manager',
    callback: () => this.openInSystem(),
  });
}
```

### Recommendations

- Always set `minAppVersion` to the oldest Obsidian version your plugin actually works with
- Maintain `versions.json` so older Obsidian installations get compatible plugin versions
- Use the `version-bump.mjs` script to automate version management
- Check for API existence at runtime when using newer features
- Test on both desktop and mobile if `isDesktopOnly` is `false`
- Update `minAppVersion` when you start using new API features

---

## 15. Popular Plugin Architectures to Learn From

### 15.1 Dataview

Repository: `blacksmithgu/obsidian-dataview`

**Architecture highlights:**

- **Index/Query separation:** The `FullIndex` class handles data indexing and maintains an in-memory representation of vault metadata. The `DataviewApi` class handles query parsing and execution.
- **Incremental indexing:** When files are modified, only the changed files are re-indexed. Updates are debounced via settings.
- **Multiple query interfaces:** Supports DQL (Dataview Query Language), DataviewJS (inline JavaScript), and inline queries.
- **Component lifecycle:** Uses Obsidian's `Component` class for managing view lifecycles, ensuring views are properly updated and destroyed.
- **Plugin as coordinator:** The main `DataviewPlugin` class creates both the `FullIndex` and `DataviewApi`, serving as an orchestrator.

**Key pattern -- Index Manager:**

```typescript
class FullIndex {
  private fileIndex: Map<string, FileMetadata>;

  constructor(private vault: Vault) {
    this.fileIndex = new Map();
  }

  async initialize(): Promise<void> {
    const files = this.vault.getMarkdownFiles();
    for (const file of files) {
      await this.indexFile(file);
    }
  }

  async indexFile(file: TFile): Promise<void> {
    const content = await this.vault.cachedRead(file);
    const metadata = this.parseMetadata(content, file);
    this.fileIndex.set(file.path, metadata);
  }

  removeFile(path: string): void {
    this.fileIndex.delete(path);
  }

  query(predicate: (meta: FileMetadata) => boolean): FileMetadata[] {
    return Array.from(this.fileIndex.values()).filter(predicate);
  }
}
```

### 15.2 Templater

Repository: `SilentVoid13/Templater`

**Architecture highlights:**

- **Template engine pattern:** Separates template parsing from execution.
- **Module system:** Internal functions are organized into modules (date, file, system, etc.), each registered independently.
- **Sandboxed execution:** User-provided JavaScript runs in a controlled context.
- **Error recovery:** Template execution errors show clear error messages without crashing the plugin.
- **Folder templates:** Watches for file creation events and applies templates based on folder rules.

**Key pattern -- Module Registry:**

```typescript
interface TemplateModule {
  name: string;
  createFunctions(): Record<string, Function>;
}

class DateModule implements TemplateModule {
  name = 'date';
  createFunctions() {
    return {
      now: (format: string) => moment().format(format),
      tomorrow: (format: string) => moment().add(1, 'day').format(format),
    };
  }
}

class ModuleRegistry {
  private modules: Map<string, TemplateModule> = new Map();

  register(module: TemplateModule): void {
    this.modules.set(module.name, module);
  }

  getAllFunctions(): Record<string, Record<string, Function>> {
    const result: Record<string, Record<string, Function>> = {};
    for (const [name, module] of this.modules) {
      result[name] = module.createFunctions();
    }
    return result;
  }
}
```

### 15.3 Smart Connections

Repository: `brianpetro/obsidian-smart-connections`

**Architecture highlights:**

- **Embedding pipeline:** Generates vector embeddings for notes, paragraphs, or blocks.
- **Local-first AI:** Supports both local models and cloud APIs for embedding generation.
- **Incremental updates:** Only re-embeds files that have changed.
- **Chunking strategy:** Splits long notes into semantically meaningful chunks for better search quality.
- **Similarity search:** Uses cosine similarity to find related notes.

### 15.4 Common Patterns Across Popular Plugins

| Pattern | Used By | Description |
|---|---|---|
| Index + Query | Dataview, Omnisearch | Separate data indexing from query execution |
| Module Registry | Templater | Register features as independent modules |
| Event-driven updates | All major plugins | React to vault changes to keep state current |
| Deferred initialization | Most plugins | Use onLayoutReady for heavy startup work |
| Settings UI as separate class | All plugins | PluginSettingTab in a separate file |
| Debounced persistence | Dataview, Smart Connections | Batch saves to avoid disk thrashing |

### Recommendations

- Study Dataview for index management and query architecture
- Study Templater for modular function systems and template engines
- Study Smart Connections for AI/embedding pipelines and incremental processing
- Keep your main Plugin class thin -- delegate to specialized service classes
- Use event-driven updates rather than polling

---

## 16. CI/CD for Obsidian Plugins

### 16.1 GitHub Actions Release Workflow

The official recommended workflow triggers on tag pushes:

```yaml
# .github/workflows/release.yml
name: Release Obsidian plugin

on:
  push:
    tags:
      - "*"

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18.x"

      - name: Build plugin
        run: |
          npm install
          npm run build

      - name: Create release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          tag="${GITHUB_REF#refs/tags/}"

          gh release create "$tag" \
            --title="$tag" \
            --draft \
            main.js manifest.json styles.css
```

### 16.2 Enhanced Workflow with Testing and Linting

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18.x'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

      - name: Check bundle size
        run: |
          SIZE=$(wc -c < main.js)
          echo "Bundle size: $SIZE bytes"
          if [ "$SIZE" -gt 1000000 ]; then
            echo "::warning::Bundle size exceeds 1MB ($SIZE bytes)"
          fi
```

### 16.3 Release Process

The standard release workflow:

1. Update code and commit
2. Update `minAppVersion` in `manifest.json` if needed
3. Run `npm version patch` (or `minor` / `major`)
   - This triggers the `version` script, which runs `version-bump.mjs`
   - `version-bump.mjs` syncs the version to `manifest.json` and `versions.json`
4. Push the commit and tag: `git push && git push --tags`
5. GitHub Actions builds and creates a draft release
6. Review the draft release and publish it
7. Obsidian detects the new release and offers it to users

### 16.4 package.json Scripts

```json
{
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production",
    "lint": "eslint src/",
    "test": "jest",
    "version": "node version-bump.mjs && git add manifest.json versions.json",
    "release": "npm version patch && git push && git push --tags"
  }
}
```

### 16.5 Beta Testing with BRAT

The BRAT (Beta Reviewers Auto-update Tester) plugin allows users to install beta versions of plugins directly from GitHub. To support BRAT:

- Create a `beta-manifest.json` in your repo root with the beta version
- Or use pre-release tags that BRAT can detect
- BRAT users add your repo URL and get automatic beta updates

### Recommendations

- Use the official GitHub Actions workflow as a starting point
- Add linting, type checking, and unit tests to CI
- Use `npm version` + `version-bump.mjs` for automated version management
- Create releases as drafts first, then review before publishing
- Use BRAT for beta testing with real users before official releases
- Monitor bundle size in CI to catch accidental bloat

---

## 17. Documentation Standards

### 17.1 README.md Requirements

Obsidian pulls `manifest.json` and `README.md` from your GitHub repo to display on the plugin's detail page. Your README should include:

```markdown
# Plugin Name

Brief description of what the plugin does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

### From Obsidian

1. Open Settings > Community Plugins
2. Click "Browse" and search for "Plugin Name"
3. Click Install, then Enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder in your vault: `.obsidian/plugins/plugin-id/`
3. Copy the downloaded files into that folder
4. Reload Obsidian and enable the plugin in Settings > Community Plugins

## Usage

Describe how to use the plugin. Include screenshots if applicable.

## Settings

| Setting | Description | Default |
|---|---|---|
| Setting 1 | What it does | Default value |
| Setting 2 | What it does | Default value |

## Commands

| Command | Description |
|---|---|
| Command 1 | What it does |
| Command 2 | What it does |

## FAQ

### Common question?

Answer.

## Support

- [Report a bug](https://github.com/user/repo/issues)
- [Request a feature](https://github.com/user/repo/issues)

## License

MIT
```

### 17.2 Changelog

Maintain a `CHANGELOG.md` using Keep a Changelog format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2025-03-15

### Added
- New command for bulk processing
- Support for custom templates

### Changed
- Improved performance for large vaults
- Updated settings UI layout

### Fixed
- Fixed crash when opening empty files
- Fixed settings not persisting on mobile

## [1.1.0] - 2025-02-01

### Added
- Initial release with core features
```

### 17.3 Settings Descriptions

In your SettingTab, provide clear, helpful descriptions:

```typescript
import { PluginSettingTab, Setting, App } from 'obsidian';

class MySettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'My Plugin Settings' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your API key for the external service. Get one at example.com/api.')
      .addText(text => text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Refresh interval')
      .setDesc('How often to sync data, in minutes. Lower values use more resources.')
      .addSlider(slider => slider
        .setLimits(1, 60, 1)
        .setValue(this.plugin.settings.refreshInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.refreshInterval = value;
          await this.plugin.saveSettings();
        })
      );

    // Group related settings with headings
    containerEl.createEl('h3', { text: 'Advanced' });

    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable verbose logging to the developer console for troubleshooting.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.debugMode)
        .onChange(async (value) => {
          this.plugin.settings.debugMode = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
```

### 17.4 What Users Expect

Based on community standards, users expect:

- **Clear README** with features, installation, usage, and settings documentation
- **Screenshots or GIFs** demonstrating the plugin in action
- **Changelog** documenting what changed in each version
- **Issue templates** for bug reports and feature requests
- **Responsive maintainer** who acknowledges issues and PRs
- **Settings descriptions** that explain what each option does and its impact
- **Stable behavior** -- plugins should not crash or corrupt vault data
- **Uninstall cleanliness** -- removing the plugin should not leave artifacts

### 17.5 Issue Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug Report
about: Report a bug or unexpected behavior
labels: bug
---

## Describe the bug

A clear description of what the bug is.

## Steps to reproduce

1. Go to '...'
2. Click on '...'
3. See error

## Expected behavior

What you expected to happen.

## Environment

- Obsidian version:
- Plugin version:
- OS:
- [ ] Desktop
- [ ] Mobile
```

### Recommendations

- Write a README that answers: what does it do, how to install, how to use, what are the settings
- Include screenshots or animated GIFs for visual plugins
- Maintain a changelog -- users want to know what changed before updating
- Provide descriptive text for every setting
- Add issue templates to guide bug reports
- Keep documentation in sync with the actual plugin behavior

---

## Appendix: Quick Reference Checklist

Use this checklist before releasing a new version:

### Pre-Release

- [ ] All async operations wrapped in try/catch
- [ ] All event handlers registered via `registerEvent` / `registerDomEvent`
- [ ] All intervals registered via `registerInterval`
- [ ] No raw `innerHTML` with user input
- [ ] `onLayoutReady` used for heavy initialization
- [ ] Settings load with defaults via `Object.assign({}, DEFAULTS, loaded)`
- [ ] Settings migration handles older versions
- [ ] Bundle size checked -- no unnecessary large dependencies
- [ ] `minAppVersion` is accurate in manifest.json
- [ ] `versions.json` is up to date
- [ ] Plugin works on both desktop and mobile (if applicable)

### Code Quality

- [ ] TypeScript strict mode enabled
- [ ] ESLint configured and passing
- [ ] Unit tests pass
- [ ] No `console.log` in production (use debug mode gating)
- [ ] Error messages are user-friendly (via Notice)
- [ ] All file paths use `normalizePath`

### Documentation

- [ ] README.md is current
- [ ] CHANGELOG.md updated for this version
- [ ] Settings have clear descriptions
- [ ] Issue templates exist

### Release

- [ ] Version bumped via `npm version`
- [ ] Tag pushed to trigger GitHub Actions
- [ ] Release assets include `main.js`, `manifest.json`, `styles.css`
- [ ] Draft release reviewed and published
