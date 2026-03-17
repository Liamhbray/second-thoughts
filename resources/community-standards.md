# Obsidian Community Plugin Development Standards

Comprehensive reference for publishing a production-quality Obsidian community plugin. Covers every aspect from manifest format to review criteria to community norms.

---

## Table of Contents

1. [manifest.json Format](#1-manifestjson-format)
2. [Plugin Submission Process](#2-plugin-submission-process)
3. [Plugin Review Criteria](#3-plugin-review-criteria)
4. [versions.json Format and Versioning Strategy](#4-versionsjson-format-and-versioning-strategy)
5. [Repository Structure Requirements](#5-repository-structure-requirements)
6. [Naming Conventions](#6-naming-conventions)
7. [License Requirements](#7-license-requirements)
8. [README Requirements](#8-readme-requirements)
9. [The obsidian-sample-plugin Template](#9-the-obsidian-sample-plugin-template)
10. [Release Process](#10-release-process)
11. [Plugin Update Mechanism](#11-plugin-update-mechanism)
12. [Beta Testing with BRAT](#12-beta-testing-with-brat)
13. [Mobile Compatibility Declarations](#13-mobile-compatibility-declarations)
14. [Deprecated APIs and Migration Guidance](#14-deprecated-apis-and-migration-guidance)
15. [Community Norms](#15-community-norms)

---

## 1. manifest.json Format

The `manifest.json` file is the single most important metadata file for an Obsidian plugin. It defines the plugin's identity, version, and compatibility requirements. Obsidian reads this file to register, display, and manage the plugin.

### TypeScript Interface (Canonical Definition)

```typescript
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    minAppVersion: string;
    description: string;
    author: string;
    authorUrl?: string;
    dir?: string;
    isDesktopOnly?: boolean;
    fundingUrl?: string | Record<string, string>;
}
```

### Field Reference

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | `string` | Unique plugin identifier. Must use only lowercase letters, numbers, and hyphens. Cannot contain the word "obsidian". Cannot be changed after release -- treat as a stable API. |
| `name` | Yes | `string` | Human-readable display name shown in the plugin browser. |
| `version` | Yes | `string` | Current plugin version. Must follow Semantic Versioning (`x.y.z`). Must match the GitHub release tag exactly. |
| `minAppVersion` | Yes | `string` | Minimum Obsidian app version required. If the user's version is lower, Obsidian consults `versions.json` for a compatible fallback. |
| `description` | Yes | `string` | Brief description of the plugin's functionality. Displayed in the community plugin browser. |
| `author` | Yes | `string` | Author's display name. |
| `authorUrl` | No | `string` | URL to the author's website or profile. |
| `isDesktopOnly` | No | `boolean` | Set to `true` if the plugin uses Node.js or Electron APIs and cannot run on mobile. Defaults to `false`. |
| `fundingUrl` | No | `string` or `object` | Link(s) where users can donate. Accepts a single URL string or an object mapping platform names to URLs. Must not point to the Obsidian website. |
| `dir` | No | `string` | Vault path to the plugin folder. Set automatically by Obsidian at runtime -- do not set this in your published manifest. |

### Complete manifest.json Example

```json
{
    "id": "my-awesome-plugin",
    "name": "My Awesome Plugin",
    "version": "1.2.0",
    "minAppVersion": "1.0.0",
    "description": "Adds productivity features to your daily notes workflow.",
    "author": "Jane Developer",
    "authorUrl": "https://janedeveloper.com",
    "isDesktopOnly": false,
    "fundingUrl": "https://buymeacoffee.com/janedeveloper"
}
```

### fundingUrl with Multiple Platforms

```json
{
    "id": "my-awesome-plugin",
    "name": "My Awesome Plugin",
    "version": "1.2.0",
    "minAppVersion": "1.0.0",
    "description": "Adds productivity features to your daily notes workflow.",
    "author": "Jane Developer",
    "authorUrl": "https://janedeveloper.com",
    "isDesktopOnly": false,
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com/janedeveloper",
        "GitHub Sponsors": "https://github.com/sponsors/janedeveloper",
        "Patreon": "https://www.patreon.com/janedeveloper"
    }
}
```

### Key Rules

- The `version` field must strictly follow Semantic Versioning: `x.y.z` (e.g., `1.0.0`, `2.3.1`). No `v` prefix.
- The `id` must not contain the substring `obsidian`. The GitHub repository name may use the `obsidian-` prefix by convention, but the plugin `id` itself must not.
- Remove `fundingUrl` entirely from the manifest if you have no donation link. Do not leave it blank or pointed at the Obsidian website.

---

## 2. Plugin Submission Process

### Prerequisites

Before submitting, you must have:

1. A public GitHub repository containing your plugin source code
2. A `README.md` in the repository root
3. A `LICENSE` file in the repository root
4. At least one GitHub release with the required assets attached
5. A `manifest.json` that conforms to all requirements
6. Read and assessed your plugin's adherence to [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies)

### Step 1: Prepare Your Repository

Ensure your repository contains at minimum:

```
your-plugin-repo/
  src/
    main.ts
  manifest.json
  package.json
  README.md
  LICENSE
  ...
```

### Step 2: Create a GitHub Release

1. Update `version` in `manifest.json` to your release version (e.g., `1.0.0`).
2. Create a git tag that matches the version exactly (e.g., `1.0.0`, not `v1.0.0`).
3. Create a GitHub release using that tag.
4. Upload these files as binary attachments to the release:
   - `main.js` (required) -- the compiled plugin bundle
   - `manifest.json` (required) -- the plugin manifest
   - `styles.css` (optional) -- custom styles, if any

Important: The release tag must match the `version` field in `manifest.json` exactly. Draft releases and pre-releases are ignored by Obsidian's update mechanism.

### Step 3: Submit a Pull Request

1. Fork the [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository.
2. Edit `community-plugins.json` and add your plugin entry **at the end of the JSON array**.
3. Your entry must match this format:

```json
{
    "id": "my-awesome-plugin",
    "name": "My Awesome Plugin",
    "author": "Jane Developer",
    "description": "Adds productivity features to your daily notes workflow.",
    "repo": "janedeveloper/my-awesome-plugin"
}
```

4. Add a comma after the closing brace of the previous entry if not at the very end.
5. The `id`, `name`, `author`, and `description` fields must match those in your `manifest.json`.
6. The `repo` field is the GitHub repository path in the format `username/repo-name`.
7. Open a pull request. Switch to preview mode and complete the submission checklist.

### Step 4: Review

- An automated bot validates your submission against multiple criteria.
- The Obsidian team manually reviews the pull request.
- Review times vary. Be patient and responsive to feedback.
- If changes are requested, update your plugin and the PR accordingly.
- Once approved, your plugin becomes available in Obsidian's community plugin browser.

---

## 3. Plugin Review Criteria

The Obsidian team (and automated bots) review plugin submissions against a comprehensive checklist. The review criteria were previously documented in `plugin-review.md` in the obsidian-releases repository but have since been consolidated into the official [Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) and [Submission Requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins).

### What Reviewers Check

#### Security

- **No `eval()` or `Function` constructor**: Using `eval()`, `new Function()`, or similar dynamic code execution is prohibited. This has been the source of real CVEs (e.g., CVE-2021-42057 in obsidian-dataview).
- **No `innerHTML`/`outerHTML`**: Using `innerHTML`, `outerHTML`, or `insertAdjacentHTML` is a security risk. Use the DOM API (`createEl()`, `createDiv()`, etc.) or Obsidian helper functions like `sanitizeHTMLToDom()` instead.
- **No hardcoded secrets**: API keys, tokens, or credentials must never be hardcoded. Use settings for user-provided credentials.
- **Network requests**: Use Obsidian's `requestUrl()` API rather than `fetch()` or third-party HTTP libraries. This handles CORS properly and works across platforms.

#### Code Quality

- **Unawaited promises**: All promises must be properly awaited, chained with `.catch()`, chained with `.then()` including a rejection handler, or explicitly voided with the `void` operator.
- **No `@ts-ignore` without justification**: Avoid disabling TypeScript checks without clear documented reasons.
- **No `any` type abuse**: Avoid disabling `@typescript-eslint/no-explicit-any` broadly.
- **Undescribed directive comments**: ESLint disable comments must include explanations.

#### Manifest Compliance

- Plugin `id` does not contain "obsidian".
- `version` follows semver format `x.y.z`.
- `isDesktopOnly` is set to `true` if the plugin uses Node.js or Electron APIs.
- `fundingUrl` does not point to the Obsidian website.
- All required manifest fields are present and correctly typed.

#### Functionality

- Plugin must provide meaningful functionality.
- Plugin must not duplicate core Obsidian functionality without significant additions.
- Plugin must properly clean up resources in `onunload()`.
- Settings must be persisted correctly using `loadData()`/`saveData()`.

#### File Handling

- Use Obsidian's `Vault` API for file operations, not Node.js `fs` module directly.
- Use `Editor` API for editing the active file.
- Use `Vault.process()` for background file modifications.
- Prefer `FileManager.trashFile()` over `Vault.trash()` or `Vault.delete()` to respect user trash settings.
- Do not store direct references to `TFile` or `TFolder` objects; use `instanceof` checks instead of type casting.

### Common Rejection Reasons

1. **Using `innerHTML` instead of DOM API or `sanitizeHTMLToDom()`**
2. **Using `eval()` or `new Function()`**
3. **Unawaited promises** without proper error handling
4. **Using Node.js/Electron APIs** without setting `isDesktopOnly: true`
5. **Missing `LICENSE` file**
6. **Plugin `id` contains "obsidian"**
7. **Release tag does not match `manifest.json` version**
8. **Missing `README.md`**
9. **Hardcoded API keys or secrets**
10. **Using `fetch()` instead of `requestUrl()`**
11. **Storing direct references to Views in the plugin class** (causes memory leaks)
12. **Not cleaning up resources in `onunload()`**

---

## 4. versions.json Format and Versioning Strategy

### Purpose

The `versions.json` file maps plugin versions to the minimum Obsidian app version they require. This allows users running older versions of Obsidian to install the most recent compatible version of your plugin.

### Format

```json
{
    "1.0.0": "0.15.0",
    "1.1.0": "0.15.0",
    "2.0.0": "1.0.0",
    "2.1.0": "1.1.0",
    "2.2.0": "1.2.0"
}
```

Each key is a plugin version, and each value is the minimum Obsidian version that plugin version requires. When Obsidian detects that a plugin's latest `manifest.json` requires a newer Obsidian version than the user is running, it consults `versions.json` to find the latest compatible plugin version and installs that instead.

### How It Works

1. Obsidian reads `manifest.json` from the plugin's GitHub repository to determine the latest version.
2. If the `minAppVersion` in `manifest.json` is higher than the user's Obsidian version, Obsidian reads `versions.json`.
3. Obsidian finds the highest plugin version whose `minAppVersion` is compatible.
4. That compatible version's release assets are downloaded and installed.

### Versioning Strategy

- Use [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
  - `MAJOR`: Breaking changes or major rewrites
  - `MINOR`: New features, backward-compatible
  - `PATCH`: Bug fixes, backward-compatible
- Only supported format is `x.y.z` -- no `v` prefix, no pre-release suffixes in production releases.
- Start your first release at `1.0.0`.
- Update `minAppVersion` only when you use new Obsidian APIs that require a newer version.

### Automated Version Bumping

The sample plugin includes a `version-bump.mjs` script. The workflow:

1. Manually update `minAppVersion` in `manifest.json` if needed.
2. Run `npm version patch`, `npm version minor`, or `npm version major`.
3. The `version` script in `package.json` automatically:
   - Runs `version-bump.mjs`, which updates `manifest.json` version and adds the new entry to `versions.json`
   - Stages `manifest.json` and `versions.json` for the commit

The relevant `package.json` script:

```json
{
    "scripts": {
        "version": "node version-bump.mjs && git add manifest.json versions.json"
    }
}
```

---

## 5. Repository Structure Requirements

### Minimum Required Files for Distribution

When a user installs your plugin, Obsidian downloads these files from your GitHub release and stores them in `VaultFolder/.obsidian/plugins/<plugin-id>/`:

```
<plugin-id>/
  main.js          (required) -- compiled plugin bundle
  manifest.json    (required) -- plugin metadata
  styles.css       (optional) -- custom CSS styles
  data.json        (created at runtime by loadData/saveData)
```

### Full Repository Structure (Source)

The standard plugin repository structure, as established by `obsidian-sample-plugin`:

```
your-plugin/
  .github/
    workflows/
      release.yml           -- GitHub Actions release workflow
  src/
    main.ts                 -- plugin entry point (TypeScript source)
  .editorconfig             -- editor configuration
  .eslintignore             -- ESLint ignore patterns
  .eslintrc                 -- ESLint configuration
  .gitignore                -- Git ignore patterns
  .npmrc                    -- npm configuration
  esbuild.config.mjs        -- esbuild bundler configuration
  manifest.json             -- plugin manifest (committed to repo root)
  package.json              -- npm package definition
  package-lock.json         -- npm lockfile
  README.md                 -- plugin documentation
  LICENSE                   -- license file
  tsconfig.json             -- TypeScript configuration
  version-bump.mjs          -- version bump automation script
  versions.json             -- version compatibility map
```

### Build Output

After building, the following file is generated (and also committed or attached to releases):

```
  main.js                   -- compiled plugin (esbuild output)
```

### Key Points

- `main.js` is the compiled bundle that Obsidian loads. It is generated by esbuild from your TypeScript source.
- `manifest.json` lives in the repo root AND is attached to each GitHub release.
- `styles.css` is optional. Only include it if your plugin needs custom CSS.
- `data.json` is created at runtime in the user's vault when your plugin calls `saveData()`. It is never included in the repository or release.
- Source files (`src/main.ts`, etc.) are only in the repository. Only build artifacts are distributed via GitHub releases.

---

## 6. Naming Conventions

### Plugin ID

- Use lowercase letters, numbers, and hyphens only.
- Must not contain the substring "obsidian".
- Should be descriptive and unique.
- Cannot be changed after the plugin is published -- treat it as a permanent identifier.
- Examples: `daily-notes-helper`, `smart-links`, `kanban-board`

### GitHub Repository Name

- By convention, many developers prefix their repo name with `obsidian-` (e.g., `obsidian-kanban-board`).
- This convention applies only to the GitHub repo name, not the plugin `id` field.
- The `repo` field in `community-plugins.json` uses the format `username/repo-name`.

### Commands

- Obsidian automatically prefixes command IDs with your plugin ID, so you do not need to include the plugin name in command IDs.
- Command names (displayed in the command palette) should be descriptive and use title case.
- Example: If your plugin ID is `daily-notes-helper` and you register a command with ID `create-note`, the full command ID becomes `daily-notes-helper:create-note`.

### Settings

- Use `camelCase` for setting property names in your settings interface.
- Use descriptive, human-readable labels in the settings tab UI.
- Provide sensible defaults for all settings using a `DEFAULT_SETTINGS` constant.

### CSS Classes

- Prefix all custom CSS classes with your plugin ID to avoid conflicts with Obsidian core styles and other plugins.
- Example: `.daily-notes-helper-container`, `.daily-notes-helper-sidebar`

### Files and Folders Created by the Plugin

- If your plugin creates files or folders in the user's vault, use clear naming and consider making the location configurable via settings.
- Avoid creating hidden files (dot-prefixed) in the vault root without user consent.

---

## 7. License Requirements

### Mandatory License File

A `LICENSE` file must be present in the root of your plugin's GitHub repository. This is a hard requirement for plugin submission.

### Recommended Licenses

Obsidian does not mandate a specific license, but the vast majority of community plugins use one of:

- **MIT License** (most common in the ecosystem)
- **Apache License 2.0**
- **GNU GPL v3**

### Attribution Requirements

If your plugin incorporates code from other plugins or open-source projects, you must provide proper attribution. This is typically done in:

- The `LICENSE` file (for substantial code reuse)
- The `README.md` (for acknowledgments)
- Inline comments in the source code

### What Is NOT Allowed

- You cannot sell community plugins through Obsidian's plugin directory. All community plugins must be free to use.
- You may accept donations via `fundingUrl` or external platforms, but the core plugin functionality must be freely available.
- Plugins that gate core functionality behind paywalls are not permitted in the community directory.

---

## 8. README Requirements

### Mandatory

Your plugin repository must include a `README.md` file in the root directory. This is a submission requirement. When users browse the community plugin directory, Obsidian pulls and displays the `README.md` directly from your GitHub repository.

### Recommended Content

While there is no rigid template, a good community plugin README should include:

1. **Plugin Name and Description**: Clear statement of what the plugin does.
2. **Features**: List of key features or capabilities.
3. **Installation Instructions**: How to install from the community plugin browser (and optionally via BRAT for beta versions).
4. **Usage Guide**: How to use the plugin, with screenshots or GIFs if applicable.
5. **Settings Documentation**: Explanation of available settings and what they control.
6. **Commands**: List of commands the plugin registers, with descriptions.
7. **Known Limitations**: Honest disclosure of what the plugin does not do or known issues.
8. **Compatibility**: Note whether the plugin works on mobile, minimum Obsidian version, etc.
9. **Contributing**: How others can contribute (issues, PRs).
10. **License**: Reference to the LICENSE file.
11. **Changelog or Release Notes**: Either inline or a link to GitHub releases.

### Tips

- Obsidian renders the README in its plugin browser, so standard Markdown formatting is supported.
- Images in the README should use absolute URLs (hosted on GitHub or elsewhere), not relative paths.
- Keep the README focused on the end user's perspective. Developer-specific documentation (build instructions, architecture) can go in a `CONTRIBUTING.md` or a `docs/` folder.

---

## 9. The obsidian-sample-plugin Template

The [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) is the official template repository maintained by the Obsidian team. It establishes the canonical patterns for plugin development.

### File Structure

```
obsidian-sample-plugin/
  .editorconfig
  .eslintignore
  .eslintrc
  .gitignore
  .npmrc
  esbuild.config.mjs
  manifest.json
  package.json
  README.md
  src/
    main.ts
  tsconfig.json
  version-bump.mjs
  versions.json
```

### Key Files and Their Roles

#### src/main.ts -- Plugin Entry Point

The main source file defines three core classes:

```typescript
import {
    App,
    Editor,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
} from "obsidian";

// Settings interface
interface MyPluginSettings {
    mySetting: string;
}

// Default settings
const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: "default",
};

// Main plugin class
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Add a ribbon icon
        const ribbonIconEl = this.addRibbonIcon(
            "dice",
            "Sample Plugin",
            (evt: MouseEvent) => {
                new Notice("This is a notice!");
            }
        );
        ribbonIconEl.addClass("my-plugin-ribbon-class");

        // Add a status bar item (desktop only)
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText("Status Bar Text");

        // Add commands
        this.addCommand({
            id: "open-sample-modal-simple",
            name: "Open sample modal (simple)",
            callback: () => {
                new SampleModal(this.app).open();
            },
        });

        this.addCommand({
            id: "sample-editor-command",
            name: "Sample editor command",
            editorCallback: (editor: Editor, view: MarkdownView) => {
                editor.replaceSelection("Sample Editor Command");
            },
        });

        // Add settings tab
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // Register events
        this.registerDomEvent(document, "click", (evt: MouseEvent) => {
            console.log("click", evt);
        });

        // Register intervals (auto-cleaned on unload)
        this.registerInterval(
            window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
        );
    }

    onunload() {
        // Cleanup (most is automatic via register* methods)
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

// Modal example
class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText("Woah!");
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Settings tab example
class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Setting #1")
            .setDesc("It's a secret")
            .addText((text) =>
                text
                    .setPlaceholder("Enter your secret")
                    .setValue(this.plugin.settings.mySetting)
                    .onChange(async (value) => {
                        this.plugin.settings.mySetting = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
```

#### manifest.json

```json
{
    "id": "sample-plugin",
    "name": "Sample Plugin",
    "version": "1.0.0",
    "minAppVersion": "0.15.0",
    "description": "Demonstrates some of the capabilities of the Obsidian API.",
    "author": "Obsidian",
    "authorUrl": "https://obsidian.md",
    "isDesktopOnly": false
}
```

#### package.json (Key Fields)

```json
{
    "name": "obsidian-sample-plugin",
    "version": "1.0.0",
    "description": "This is a sample plugin for Obsidian",
    "main": "main.js",
    "type": "module",
    "scripts": {
        "dev": "node esbuild.config.mjs",
        "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
        "version": "node version-bump.mjs && git add manifest.json versions.json"
    },
    "devDependencies": {
        "@typescript-eslint/eslint-plugin": "5.29.0",
        "@typescript-eslint/parser": "5.29.0",
        "builtin-modules": "3.3.0",
        "esbuild": "0.25.5",
        "obsidian": "latest",
        "tslib": "2.4.0",
        "typescript": "^5.8.3"
    }
}
```

#### esbuild.config.mjs

The build configuration:

- Uses esbuild to bundle TypeScript into a single `main.js`
- Marks `obsidian` as external (the API is provided by Obsidian at runtime, not bundled)
- Marks `electron` and all `@codemirror/*` packages as external
- In development mode (`npm run dev`): runs in watch mode with sourcemaps
- In production mode (`npm run build`): runs TypeScript type checking first, then builds with minification

#### tsconfig.json

Configures TypeScript for the Obsidian environment:

- Target: `ES6`
- Module: `ESNext`
- Strict mode enabled
- Includes the `src/` directory

#### version-bump.mjs

Automation script that:

1. Reads `minAppVersion` from `manifest.json`
2. Reads the target version from `process.env.npm_package_version` (set by `npm version`)
3. Updates `manifest.json` with the new version
4. Adds a new entry to `versions.json` mapping the new plugin version to `minAppVersion`

### Patterns Established by the Template

1. **Settings pattern**: `interface` + `DEFAULT_SETTINGS` constant + `loadSettings()`/`saveSettings()` methods using `Object.assign`.
2. **Lifecycle pattern**: All registration in `onload()`, cleanup in `onunload()` (with most cleanup automatic via `register*` methods).
3. **Build pattern**: Two-stage build -- TypeScript type checking (`tsc -noEmit`) followed by esbuild bundling.
4. **Version management pattern**: `version-bump.mjs` + npm `version` script to keep `manifest.json`, `package.json`, and `versions.json` in sync.

---

## 10. Release Process

### Manual Release Process

1. **Update version**: Run `npm version patch`, `npm version minor`, or `npm version major`.
   - This triggers the `version` script, which updates `manifest.json` and `versions.json`.
2. **Build**: Run `npm run build` to generate `main.js`.
3. **Tag**: The `npm version` command creates a git tag automatically.
4. **Push**: Push the commit and tag: `git push && git push --tags`.
5. **Create GitHub Release**:
   - Go to your repository's Releases page.
   - Create a new release using the tag (e.g., `1.2.0`).
   - Upload `main.js`, `manifest.json`, and `styles.css` (if applicable) as binary attachments.
   - Write release notes.
   - Publish (not draft, not pre-release -- Obsidian ignores both).

### Automated Release with GitHub Actions

The recommended approach uses a GitHub Actions workflow. Create `.github/workflows/release.yml`:

```yaml
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

### Workflow with GitHub Actions

1. Update version: `npm version patch` (or `minor`/`major`).
2. Push commits and tag: `git push && git push --tags`.
3. GitHub Actions automatically:
   - Checks out code
   - Installs dependencies
   - Builds the plugin
   - Creates a draft GitHub release with `main.js`, `manifest.json`, and `styles.css` attached
4. Go to the GitHub Releases page, review the draft, add release notes, and publish it.

### Release Checklist

- [ ] Version in `manifest.json` matches the git tag
- [ ] Version in `package.json` matches the git tag
- [ ] `versions.json` has an entry for the new version
- [ ] `main.js` is freshly built from the tagged commit
- [ ] Release is not marked as draft or pre-release (Obsidian ignores both)
- [ ] `main.js` and `manifest.json` are attached as release assets
- [ ] `styles.css` is attached if your plugin uses custom styles

---

## 11. Plugin Update Mechanism

### How Obsidian Discovers Plugins

1. Obsidian reads `community-plugins.json` from the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository to populate the community plugin browser.
2. The `name`, `author`, and `description` fields in `community-plugins.json` are used for search/filtering in the browser.
3. When a user opens the detail page for a plugin, Obsidian pulls `manifest.json` and `README.md` directly from the plugin's GitHub repository (default branch).

### How Updates Work

1. **Version detection**: Obsidian reads `manifest.json` from your GitHub repository's default branch. The `version` field determines the latest available version.
2. **Compatibility check**: If `minAppVersion` in `manifest.json` is higher than the user's Obsidian version, Obsidian reads `versions.json` to find the latest compatible version.
3. **Download**: Obsidian looks for a GitHub release tagged with the target version. It downloads `manifest.json`, `main.js`, and `styles.css` (if present) from the release assets.
4. **Installation**: Downloaded files are stored in `VaultFolder/.obsidian/plugins/<plugin-id>/`.

### Important Details

- Only published releases are considered. Draft releases and pre-releases are ignored.
- The release tag must match the version string exactly (e.g., `1.2.0`, not `v1.2.0`).
- Obsidian checks for updates periodically when the app is open. Users can also manually check via Settings > Community Plugins > Check for updates.
- There is no automatic update mechanism by default. Users must explicitly click "Update" for each plugin (or "Update all").
- The `manifest.json` in the repository root is used for version detection. The `manifest.json` attached to the GitHub release is what gets installed.

### Flow Diagram

```
User opens Obsidian
  -> Obsidian fetches community-plugins.json (plugin registry)
  -> For each installed plugin:
       -> Fetch manifest.json from plugin's GitHub repo (default branch)
       -> Compare version with installed version
       -> If newer version available:
            -> Check minAppVersion compatibility
            -> If compatible: offer update
            -> If not compatible: check versions.json for fallback
       -> User clicks "Update"
            -> Download main.js, manifest.json, styles.css from GitHub release
            -> Replace files in .obsidian/plugins/<plugin-id>/
            -> Reload plugin
```

---

## 12. Beta Testing with BRAT

### What Is BRAT?

BRAT (Beta Reviewer's Auto-update Tool) is a community plugin by TfTHacker that enables users to install and update plugins directly from GitHub repositories, bypassing the official community plugin directory. It is the standard mechanism for distributing beta versions of Obsidian plugins.

Repository: [https://github.com/TfTHacker/obsidian42-brat](https://github.com/TfTHacker/obsidian42-brat)

### For Plugin Developers: Distributing via BRAT

1. **Prepare your repository**: Your plugin must have a valid GitHub release with `main.js` and `manifest.json` attached (same format as production releases).
2. **Share the repository URL**: Give beta testers your GitHub repository URL (e.g., `https://github.com/janedeveloper/my-awesome-plugin`).
3. **Create releases**: BRAT uses GitHub releases to track versions. You can use pre-releases or regular releases.
4. **Notify testers**: When you publish a new release, BRAT users can check for updates manually or configure automatic checking.

### For Beta Testers: Installing via BRAT

1. **Install BRAT**: Search for "BRAT" in Settings > Community Plugins > Browse. Enable it.
2. **Add a beta plugin**: Open the command palette and run `BRAT: Add a beta plugin for testing`.
3. **Paste the URL**: Enter the GitHub repository URL and click "Add Plugin".
4. **Enable the plugin**: Go to Settings > Community Plugins and enable the newly installed beta plugin.
5. **Update**: Click the refresh icon beside the plugin in BRAT's settings, or use the command palette: `BRAT: Check for updates to all beta plugins and UPDATE`.

### When to Use BRAT

- Before your first submission to the community plugin directory (to get early feedback).
- When testing major new features or breaking changes before a production release.
- When you want a small group of users to validate fixes before wider release.
- The Obsidian team recommends BRAT for beta distribution (see [Beta-testing plugins](https://docs.obsidian.md/Plugins/Releasing/Beta-testing+plugins)).

### Caveats

- Beta plugins installed via BRAT can be unstable. Users should expect potential crashes.
- BRAT-installed plugins do not appear in the official community plugin browser.
- Once a plugin is published to the community directory, users should switch to the official version.

---

## 13. Mobile Compatibility Declarations

### The `isDesktopOnly` Flag

The `isDesktopOnly` field in `manifest.json` controls whether Obsidian allows the plugin to be installed on mobile devices (iOS/Android).

- `isDesktopOnly: false` (default): Plugin is available on all platforms.
- `isDesktopOnly: true`: Plugin is only available on desktop (Windows, macOS, Linux).

### When to Set `isDesktopOnly: true`

You must set `isDesktopOnly: true` if your plugin uses any of the following:

- **Node.js APIs**: `fs`, `path`, `child_process`, `os`, `crypto` (Node module), `net`, `http`/`https` (Node modules), etc.
- **Electron APIs**: `BrowserWindow`, `dialog`, `shell`, `clipboard` (Electron), `ipcRenderer`, `remote`, etc.
- **Any Node.js or Electron modules**: These are not available on mobile and will cause crashes.

### Mobile Development Best Practices

1. **Use Obsidian APIs for file operations**: Use `Vault` and `FileManager` instead of `fs`.
2. **Use `requestUrl()` for HTTP requests**: Instead of Node.js `http`/`https` or `fetch()`.
3. **Test on mobile**: Use Obsidian's built-in mobile emulation during development:

```typescript
// Toggle mobile emulation in the developer console
this.app.emulateMobile(true);   // Enable mobile mode
this.app.emulateMobile(false);  // Disable mobile mode
```

4. **Check platform at runtime** when you must use platform-specific code:

```typescript
import { Platform } from "obsidian";

if (Platform.isDesktop) {
    // Desktop-only code
}

if (Platform.isMobile) {
    // Mobile-specific code
}

if (Platform.isDesktopApp) {
    // Electron-specific code
}
```

5. **Avoid status bar items on mobile**: The status bar is a desktop-only UI element.
6. **Test UI responsiveness**: Mobile screens are smaller. Ensure your modals, sidebars, and views adapt.

### Submission Requirement

If your plugin cannot function on mobile platforms, you must set `isDesktopOnly: true`. The automated review bot checks for Node.js/Electron imports and will flag plugins that use them without setting this flag.

---

## 14. Deprecated APIs and Migration Guidance

### How Deprecations Are Communicated

- Deprecated APIs are marked with `@deprecated` JSDoc tags in `obsidian.d.ts` (the type definition file in the [obsidian-api](https://github.com/obsidianmd/obsidian-api) repository).
- Each `@deprecated` annotation typically includes migration guidance (e.g., "use X instead").
- The Obsidian team announces significant deprecations in release notes and developer documentation.

### Key Deprecated APIs and Migrations

#### File Operations

| Deprecated | Replacement | Notes |
|------------|-------------|-------|
| `Vault.modify()` for active files | `Editor` API | Use `Editor` for editing the currently active file |
| `Vault.delete()` | `FileManager.trashFile()` | Respects user's trash settings |
| `Vault.trash()` | `FileManager.trashFile()` | Respects user's trash settings |
| Direct `fs` module usage | `Vault` API | Required for mobile compatibility |

#### HTTP Requests

| Deprecated/Discouraged | Replacement | Notes |
|------------------------|-------------|-------|
| `fetch()` | `requestUrl()` | Handles CORS, works on all platforms |
| Axios, node-fetch, etc. | `requestUrl()` | Reduces bundle size, ensures compatibility |

#### View References

| Deprecated Pattern | Replacement | Notes |
|-------------------|-------------|-------|
| Storing `View` references in plugin class | Use `Workspace` API to get views when needed | Prevents memory leaks |
| Type casting to `TFile`/`TFolder` | `instanceof` checks | Safer, caught by ESLint plugin |

### ESLint Plugin for Obsidian

The official [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin) provides 27+ rules to catch common issues:

```bash
npm install --save-dev @obsidianmd/eslint-plugin
```

Key rules include:

- **no-hardcoded-config-path**: Don't hardcode `.obsidian` config path
- **no-view-references-in-plugin**: Don't store View references in the Plugin class
- **prefer-file-manager-trash**: Use `FileManager.trashFile()` over `Vault.trash()`/`Vault.delete()`
- **no-tfile-tfolder-cast**: Use `instanceof` instead of type casting for `TFile`/`TFolder`
- **vault-process-for-background-edits**: Use `Vault.process()` for background file modifications
- **editor-api-for-active-edits**: Use `Editor` API for active file edits

Configuration (ESLint v9 flat config):

```javascript
// eslint.config.js
import obsidian from "@obsidianmd/eslint-plugin";

export default [
    obsidian.configs.recommended,
    // your other config...
];
```

### Staying Current

- Watch the [obsidian-api](https://github.com/obsidianmd/obsidian-api) repository for updates to `obsidian.d.ts`.
- Read the [Obsidian changelog](https://obsidian.md/changelog/) for API changes.
- Participate in the annual Obsidian October event, which includes self-assessment checklists that highlight the latest API recommendations.

---

## 15. Community Norms

### What the Community Expects from Plugin Authors

#### Responsiveness

- **Respond to issues**: Users file issues on your GitHub repository. Timely responses (even if just acknowledging the issue) build trust.
- **Review pull requests**: Community contributions are common. Review and respond to PRs, even if you decline them.
- **Communicate status**: If you cannot maintain the plugin, say so publicly. This helps users plan and potentially find new maintainers.

#### Maintenance

- **Keep up with Obsidian updates**: When Obsidian releases updates that break your plugin, users expect timely fixes.
- **Update dependencies**: Keep your build tools and dependencies reasonably current.
- **Address security issues promptly**: Security-related bugs should be prioritized.
- **Abandoned plugins**: Obsidian may deprecate plugin versions that cause significant data loss. Plugins that remain unmaintained for extended periods become a friction point for the community.

#### Changelogs and Release Notes

- **Use GitHub Release notes**: Write meaningful release notes for each version. Describe what changed, was fixed, or was added.
- **Users rely on changelogs to decide whether to update**: Many users are cautious about updating plugins and want to understand what changed before clicking "Update."
- **The Plugin Changelogs plugin** ([phibr0/obsidian-plugin-changelogs](https://github.com/phibr0/obsidian-plugin-changelogs)) surfaces your GitHub release notes inside Obsidian -- but only if you write them.

#### Quality Standards

- **Test on both desktop and mobile** (if not desktop-only).
- **Minimize performance impact**: Plugins run in Obsidian's main process. Heavy computation, frequent DOM manipulation, or excessive network requests degrade the entire app.
- **Follow the Plugin Guidelines**: The [official guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) represent minimum quality standards.
- **Use the self-critique checklist**: The Obsidian October event publishes annual [self-assessment checklists](https://docs.obsidian.md/oo24/plugin) covering performance, security, mobile compatibility, and API usage. These are valuable even outside the event.

#### Communication Channels

- **GitHub Issues**: Primary channel for bug reports and feature requests.
- **Obsidian Forum** ([forum.obsidian.md](https://forum.obsidian.md/)): The Developers: Plugin & API category is active. Good for questions, announcements, and discussion.
- **Obsidian Discord**: Real-time chat with other developers and users.
- **Plugin README**: Your primary documentation surface. Keep it current.

#### Monetization Norms

- Community plugins must be free. You cannot charge for a plugin listed in the community directory.
- Donations are encouraged and supported via the `fundingUrl` field in `manifest.json`.
- Common donation platforms: Buy Me a Coffee, GitHub Sponsors, Patreon, Ko-fi.
- Some developers offer premium features via separate services (e.g., sync backends) while keeping the plugin itself free. This is generally accepted if the core plugin provides value on its own.
- Do not use the plugin to aggressively promote paid services or display advertisements.

#### Handoff and Succession

- If you can no longer maintain your plugin, consider:
  - Archiving the repository with a note pointing to forks
  - Transferring the repository to a new maintainer
  - Posting in the Obsidian Forum that you are looking for a new maintainer
- The Obsidian team can update the `community-plugins.json` entry to point to a new repository if ownership changes.

---

## Appendix A: Quick Reference Checklist for New Plugin Submissions

```
Pre-Submission Checklist:

Repository:
  [ ] Public GitHub repository
  [ ] README.md in repository root
  [ ] LICENSE file in repository root
  [ ] manifest.json in repository root

manifest.json:
  [ ] id: unique, lowercase + hyphens, no "obsidian" substring
  [ ] name: descriptive display name
  [ ] version: semver x.y.z format
  [ ] minAppVersion: set to minimum required Obsidian version
  [ ] description: concise, accurate
  [ ] author: your name
  [ ] isDesktopOnly: true if using Node.js/Electron APIs
  [ ] fundingUrl: valid URL or removed entirely

GitHub Release:
  [ ] Tag matches version in manifest.json exactly (no "v" prefix)
  [ ] main.js attached as release asset
  [ ] manifest.json attached as release asset
  [ ] styles.css attached (if applicable)
  [ ] Not marked as draft or pre-release

Code Quality:
  [ ] No eval() or new Function()
  [ ] No innerHTML/outerHTML (use DOM API or sanitizeHTMLToDom)
  [ ] No hardcoded secrets
  [ ] All promises properly handled
  [ ] Uses requestUrl() instead of fetch()
  [ ] Uses Vault API instead of fs module
  [ ] Resources cleaned up in onunload()
  [ ] No direct View references stored in plugin class

community-plugins.json Entry:
  [ ] Added at the end of the array
  [ ] id, name, author, description match manifest.json
  [ ] repo field is username/repo-name format

Submission:
  [ ] Read Developer Policies
  [ ] Completed pull request checklist
  [ ] Quality attestation completed
```

## Appendix B: Essential Links

| Resource | URL |
|----------|-----|
| Official Developer Docs | https://docs.obsidian.md/ |
| Plugin Guidelines | https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines |
| Submission Requirements | https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins |
| Submit Your Plugin | https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin |
| Developer Policies | https://docs.obsidian.md/Developer+policies |
| Sample Plugin Template | https://github.com/obsidianmd/obsidian-sample-plugin |
| Obsidian API Types | https://github.com/obsidianmd/obsidian-api |
| Community Plugins Registry | https://github.com/obsidianmd/obsidian-releases |
| ESLint Plugin | https://github.com/obsidianmd/eslint-plugin |
| BRAT Plugin | https://github.com/TfTHacker/obsidian42-brat |
| Obsidian Forum (Dev) | https://forum.obsidian.md/c/developers-api/14 |
| Plugin Self-Critique Checklist | https://docs.obsidian.md/oo24/plugin |
| Obsidian Changelog | https://obsidian.md/changelog/ |
| Mobile Development Guide | https://docs.obsidian.md/Plugins/Getting+started/Mobile+development |
| Release with GitHub Actions | https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions |
| Beta Testing Plugins | https://docs.obsidian.md/Plugins/Releasing/Beta-testing+plugins |
