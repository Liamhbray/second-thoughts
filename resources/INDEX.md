# Obsidian Plugin Development — Resource Index

Offline reference library for building a production-ready Obsidian community plugin in TypeScript. ~9,500 lines across 5 documents.

## Documents

### [API Reference](api-reference.md) (1,875 lines)

Complete TypeScript API reference for the Obsidian Plugin API.

- **Plugin Class** — lifecycle (`onload`, `onunload`), data persistence (`loadData`, `saveData`), registration methods
- **Vault API** — file CRUD (`read`, `cachedRead`, `create`, `modify`, `process`, `delete`, `rename`), file retrieval (`getFileByPath`, `getFiles`), events (`create`, `modify`, `delete`, `rename`)
- **MetadataCache API** — `getFileCache`, `resolvedLinks`, `unresolvedLinks`, `getFirstLinkpathDest`, events (`changed`, `resolve`, `resolved`)
- **Workspace API** — `getActiveFile`, `getActiveViewOfType`, `getLeaf`, `onLayoutReady`, events (`file-open`, `active-leaf-change`, `layout-change`)
- **FileManager API** — `processFrontMatter`, `renameFile`, `generateMarkdownLink`
- **Editor API** — cursor, selection, replacement, transaction methods
- **UI APIs** — `addCommand`, `addRibbonIcon`, `addStatusBarItem`, `Modal`, `Notice`, `Setting`, `PluginSettingTab`
- **Events System** — `registerEvent`, `registerDomEvent`, `registerInterval`, `register`
- **File Types** — `TFile`, `TFolder`, `TAbstractFile`, `FileStats`
- **MarkdownView & PostProcessor** — view types, render children, post-processing context
- **Supporting Types** — `Pos`, `Loc`, cache interfaces, `DataWriteOptions`, `App`

### [Best Practices](best-practices.md) (2,125 lines)

Official guidelines and recommended patterns for plugin development.

- **Official Plugin Guidelines** — general principles, security, vault operations, styling
- **Vault API vs Adapter API** — when to use which, caching and serialization advantages
- **File Access Patterns** — efficient retrieval, avoiding full-vault iteration
- **Event Handling** — `registerEvent` for auto-cleanup, avoiding leaks
- **Settings Management** — `PluginSettingTab`, default merging, `saveData`/`loadData`
- **Frontmatter Handling** — `processFrontMatter` vs manual YAML parsing
- **Performance Patterns** — `cachedRead`, debouncing, main thread yielding
- **Error Handling** — try/catch, user-facing `Notice`, graceful degradation
- **DOM Events** — registration and cleanup patterns
- **Command Registration** — editor commands, conditional commands, hotkeys
- **CSS & Styling** — CSS variables, theme compatibility, scoping
- **CodeMirror 6** — editor extensions, view plugins, state fields
- **Multiple Windows** — handling multiple vault windows
- **Ribbon & Status Bar** — icon patterns, dynamic updates
- **Modals & Views** — custom modals, leaf views, sidebar panels

### [Community Standards](community-standards.md) (1,112 lines)

Everything needed to publish and maintain a community plugin.

- **manifest.json** — full field reference, TypeScript interface, examples
- **Submission Process** — step-by-step PR to obsidian-releases
- **Review Criteria** — what reviewers check, common rejection reasons
- **versions.json** — format, versioning strategy, minAppVersion mapping
- **Repository Structure** — required files (`main.js`, `manifest.json`, `styles.css`)
- **Naming Conventions** — plugin IDs, command IDs, CSS classes
- **License Requirements** — acceptable licenses, recommendation
- **README Standards** — expected sections, screenshots, installation instructions
- **Sample Plugin Template** — structure and patterns it establishes
- **Release Process** — GitHub releases, tag format, asset uploads
- **Update Mechanism** — how Obsidian checks for and installs updates
- **BRAT Beta Testing** — pre-release distribution workflow
- **Mobile Compatibility** — `isDesktopOnly` flag, mobile constraints
- **Deprecated APIs** — migration guidance for outdated methods
- **Community Norms** — responsiveness, changelogs, user expectations

### [Gotchas](gotchas.md) (1,724 lines)

Common pitfalls, edge cases, and how to avoid them.

- **Main Thread Blocking** — symptoms, Web Workers limitations, chunked processing
- **Memory Leaks** — unregistered events, DOM references, intervals
- **Race Conditions** — file read/write conflicts, metadata cache not ready
- **Mobile vs Desktop** — API gaps, performance constraints, filesystem differences
- **MetadataCache Timing** — cache not ready on startup, `resolved` event ordering
- **Vault.modify vs Vault.process** — when each can fail, atomicity
- **Adapter API Pitfalls** — why Vault API is preferred
- **Plugin Loading Order** — no guaranteed order, inter-plugin dependencies
- **Hot Reload** — state not cleaning up on disable/enable
- **CSS Conflicts** — theme clashes, specificity wars, other plugins
- **Electron/Node.js Constraints** — version pinning, API availability
- **File Path Issues** — case sensitivity, special characters, separators
- **Frontmatter Edge Cases** — malformed YAML, missing delimiters
- **Large Vault Performance** — what breaks at 10k+ notes
- **Settings Migration** — schema changes between versions
- **API Breaking Changes** — historical changes, version compatibility
- **Build Pipeline** — esbuild configuration, TypeScript issues
- **data.json** — corruption, size limits, concurrent access
- **Workspace Serialization** — view state persistence gotchas
- **Non-Markdown Files** — Canvas, images, PDFs, attachments

### [Production Readiness](production-readiness.md) (2,636 lines)

What separates a hobby plugin from a production one.

- **Testing** — Jest with `jest-environment-obsidian`, mocking, integration testing
- **Error Handling** — graceful degradation, `Notice` for user-facing errors
- **Performance Optimization** — lazy loading, debouncing, `requestAnimationFrame`, chunking
- **Background Processing** — `registerInterval`, `setTimeout`, yielding to main thread
- **Settings Migration** — versioned schemas, upgrade paths
- **Data Persistence** — `saveData`/`loadData` patterns, custom files, size considerations
- **Logging & Debugging** — console patterns, dev tools, debug modes
- **Accessibility** — keyboard navigation, screen readers, ARIA
- **Internationalization** — i18n/l10n patterns
- **Security** — input sanitization, XSS prevention in rendered content
- **Bundle Size** — tree shaking, dependency management, esbuild config
- **Health Monitoring** — detecting runtime failures, self-diagnostics
- **Startup & Shutdown** — crash recovery, graceful lifecycle
- **Version Compatibility** — testing across Obsidian versions
- **Reference Architectures** — Smart Connections, Dataview, Templater patterns
- **CI/CD** — GitHub Actions for automated releases
- **Documentation Standards** — README, settings descriptions, changelogs

## Cross-Reference: SDD to Resources

Key sections of the [SDD](../SDD.md) and where to find supporting reference material:

| SDD Section | Primary Resource | Sections |
|---|---|---|
| 3.1 Obsidian's Data Model | [API Reference](api-reference.md) | Vault API, MetadataCache API |
| 3.2 Event Subscriptions | [API Reference](api-reference.md) | Events System |
| | [Best Practices](best-practices.md) | Event Handling Patterns |
| 3.3 Two-Layer Indexing | [API Reference](api-reference.md) | MetadataCache API |
| | [Gotchas](gotchas.md) | MetadataCache Timing |
| 3.4 Plugin Components | [API Reference](api-reference.md) | Plugin Class, UI APIs |
| | [Best Practices](best-practices.md) | Settings Management, Modals & Views |
| 4.3 Idle Detection | [API Reference](api-reference.md) | Workspace API, Vault events |
| | [Gotchas](gotchas.md) | Race Conditions |
| 5.1 Scoping Mechanisms | [API Reference](api-reference.md) | MetadataCache (`resolvedLinks`), Vault (`getFileByPath`) |
| 6.2 Semantic Bootstrapping | [Production Readiness](production-readiness.md) | Background Processing, Performance Optimization |
| | [Gotchas](gotchas.md) | Large Vault Performance, Main Thread Blocking |
| 9.1 Tag Format | [Gotchas](gotchas.md) | Frontmatter Edge Cases |
| 10. Plugin Settings | [Best Practices](best-practices.md) | Settings Management |
| | [Production Readiness](production-readiness.md) | Settings Migration |
| 11. Constraints | [Best Practices](best-practices.md) | Vault API vs Adapter API, Frontmatter Handling |
| Distribution | [Community Standards](community-standards.md) | Submission, Review, Release Process |
