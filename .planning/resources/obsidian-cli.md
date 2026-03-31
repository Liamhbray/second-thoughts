# Obsidian CLI Reference

Scraped 2026-03-31 from official Obsidian documentation and community resources.

---

## 1. Official Documentation

**Source:** https://obsidian.md/help/cli

Obsidian CLI is a command line interface that lets you control Obsidian from your terminal for scripting, automation, and integration with external tools. Anything you can do in Obsidian you can do from the command line, including developer commands to access developer tools, inspect elements, take screenshots, reload plugins, and more.

**Requirements:** Obsidian 1.12+ installer. The Obsidian app must be running (CLI connects to the running instance). If Obsidian is not running, the first CLI command launches it.

### Installation

1. Go to **Settings > General**.
2. Enable **Command line interface**.
3. Follow the prompt to register Obsidian CLI.

On macOS, registration adds the Obsidian binary directory to PATH via `~/.zprofile`:
```
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
```

### Getting Started

Run an individual command:
```shell
obsidian help
```

Use the TUI (interactive terminal interface with autocomplete and history):
```shell
obsidian
help
```

### Syntax

**Parameters** take a value with `=`. Quote values with spaces:
```shell
obsidian create name="My Note" content="Hello world"
```

**Flags** are boolean switches with no value:
```shell
obsidian create name=Note content="Hello" open overwrite
```

For multiline content use `\n` for newline and `\t` for tab:
```shell
obsidian create name=Note content="# Title\n\nBody text"
```

### Targeting

**Vault targeting:** If CWD is a vault folder, that vault is used. Otherwise the active vault. Use `vault=<name>` as the first parameter to target a specific vault:
```shell
obsidian vault=Notes daily
obsidian vault="My Vault" search query="test"
```

**File targeting:** Many commands accept `file` and `path` parameters:
- `file=<name>` -- resolves like a wikilink (name only, no path or extension needed)
- `path=<path>` -- exact path from vault root, e.g. `folder/note.md`
- If neither provided, defaults to the active file.

**Copy output:** Add `--copy` to any command to copy output to clipboard.

---

## 2. Complete Command Reference

### General Commands

| Command | Description |
|---------|-------------|
| `help [command]` | Show all commands or help for a specific command |
| `version` | Show Obsidian version |
| `reload` | Reload the app window |
| `restart` | Restart the app |

### Files and Folders

| Command | Description |
|---------|-------------|
| `file` | Show file info (default: active file) |
| `files` | List files in vault. Params: `folder=`, `ext=`, `total` |
| `folder` | Show folder info. Params: `path=` (required), `info=files\|folders\|size` |
| `folders` | List folders. Params: `folder=`, `total` |
| `open` | Open a file. Params: `file=`, `path=`, `newtab` |
| `create` | Create/overwrite file. Params: `name=`, `path=`, `content=`, `template=`, `overwrite`, `open`, `newtab` |
| `read` | Read file contents (default: active file) |
| `append` | Append content. Params: `content=` (required), `inline` |
| `prepend` | Prepend after frontmatter. Params: `content=` (required), `inline` |
| `move` | Move/rename file. Params: `to=` (required). Auto-updates internal links |
| `rename` | Rename file. Params: `name=` (required). Preserves extension |
| `delete` | Delete file (trash by default). Flag: `permanent` |

### Search

| Command | Description |
|---------|-------------|
| `search` | Search vault for text. Params: `query=` (required), `path=`, `limit=`, `format=text\|json`, `total`, `case` |
| `search:context` | Search with matching line context (grep-style `path:line: text`). Same params as `search` |
| `search:open` | Open search view |

### Links

| Command | Description |
|---------|-------------|
| `backlinks` | List backlinks. Params: `counts`, `total`, `format=` |
| `links` | List outgoing links. Params: `total` |
| `unresolved` | List unresolved links. Params: `total`, `counts`, `verbose` |
| `orphans` | Files with no incoming links. Params: `total` |
| `deadends` | Files with no outgoing links. Params: `total` |

### Tags

| Command | Description |
|---------|-------------|
| `tags` | List tags. Params: `file=`, `sort=count`, `total`, `counts`, `active`, `daily` |
| `tag` | Get tag info. Params: `name=` (required), `total`, `verbose` |

### Tasks

| Command | Description |
|---------|-------------|
| `tasks` | List tasks. Params: `file=`, `status=`, `total`, `done`, `todo`, `verbose`, `active`, `daily` |
| `task` | Show/update task. Params: `ref=path:line`, `file=`, `line=`, `status=`, `toggle`, `done`, `todo`, `daily` |

### Properties

| Command | Description |
|---------|-------------|
| `aliases` | List aliases. Params: `total`, `verbose`, `active` |
| `properties` | List properties. Params: `name=`, `sort=count`, `format=yaml\|json\|tsv`, `total`, `counts`, `active` |
| `property:set` | Set property. Params: `name=` (required), `value=` (required), `type=` |
| `property:remove` | Remove property. Params: `name=` (required) |
| `property:read` | Read property value. Params: `name=` (required) |

### Daily Notes

| Command | Description |
|---------|-------------|
| `daily` | Open daily note. Params: `paneType=tab\|split\|window` |
| `daily:path` | Get daily note path (even if not yet created) |
| `daily:read` | Read daily note contents |
| `daily:append` | Append to daily note. Params: `content=` (required), `inline`, `open` |
| `daily:prepend` | Prepend to daily note. Params: `content=` (required), `inline`, `open` |

### Outline

| Command | Description |
|---------|-------------|
| `outline` | Show headings. Params: `format=tree\|md\|json`, `total` |

### Plugins

| Command | Description |
|---------|-------------|
| `plugins` | List installed plugins. Params: `filter=core\|community`, `versions`, `format=` |
| `plugins:enabled` | List enabled plugins. Same params |
| `plugins:restrict` | Toggle restricted mode. Flags: `on`, `off` |
| `plugin` | Get plugin info. Params: `id=` (required) |
| `plugin:enable` | Enable plugin. Params: `id=` (required) |
| `plugin:disable` | Disable plugin. Params: `id=` (required) |
| `plugin:install` | Install community plugin. Params: `id=` (required), `enable` |
| `plugin:uninstall` | Uninstall community plugin. Params: `id=` (required) |
| `plugin:reload` | Reload plugin (for developers). Params: `id=` (required) |

### Bookmarks

| Command | Description |
|---------|-------------|
| `bookmarks` | List bookmarks. Params: `total`, `verbose`, `format=` |
| `bookmark` | Add bookmark. Params: `file=`, `subpath=`, `folder=`, `search=`, `url=`, `title=` |

### Templates

| Command | Description |
|---------|-------------|
| `templates` | List templates. Params: `total` |
| `template:read` | Read template. Params: `name=` (required), `title=`, `resolve` |
| `template:insert` | Insert template into active file. Params: `name=` (required) |

### Themes and CSS Snippets

| Command | Description |
|---------|-------------|
| `themes` | List installed themes. Params: `versions` |
| `theme` | Show active theme or get info. Params: `name=` |
| `theme:set` | Set theme. Params: `name=` (required, empty for default) |
| `theme:install` | Install theme. Params: `name=` (required), `enable` |
| `theme:uninstall` | Uninstall theme. Params: `name=` (required) |
| `snippets` | List CSS snippets |
| `snippets:enabled` | List enabled snippets |
| `snippet:enable` | Enable snippet. Params: `name=` (required) |
| `snippet:disable` | Disable snippet. Params: `name=` (required) |

### Bases

| Command | Description |
|---------|-------------|
| `bases` | List all `.base` files |
| `base:views` | List views in current base |
| `base:create` | Create item in base. Params: `file=`, `view=`, `name=`, `content=`, `open`, `newtab` |
| `base:query` | Query a base. Params: `file=`, `view=`, `format=json\|csv\|tsv\|md\|paths` |

### Command Palette

| Command | Description |
|---------|-------------|
| `commands` | List command IDs. Params: `filter=<prefix>` |
| `command` | Execute an Obsidian command. Params: `id=` (required) |
| `hotkeys` | List hotkeys. Params: `total`, `verbose`, `format=` |
| `hotkey` | Get hotkey for command. Params: `id=` (required), `verbose` |

### Sync

| Command | Description |
|---------|-------------|
| `sync` | Pause/resume sync. Flags: `on`, `off` |
| `sync:status` | Show sync status and usage |
| `sync:history` | List sync version history. Params: `total` |
| `sync:read` | Read a sync version. Params: `version=` (required) |
| `sync:restore` | Restore a sync version. Params: `version=` (required) |
| `sync:open` | Open sync history |
| `sync:deleted` | List deleted files in sync. Params: `total` |

### Publish

| Command | Description |
|---------|-------------|
| `publish:site` | Show publish site info |
| `publish:list` | List published files. Params: `total` |
| `publish:status` | List publish changes. Params: `total`, `new`, `changed`, `deleted` |
| `publish:add` | Publish file. Params: `changed` (all changed) |
| `publish:remove` | Unpublish file |
| `publish:open` | Open file on published site |

### File History

| Command | Description |
|---------|-------------|
| `diff` | List/compare versions. Params: `from=`, `to=`, `filter=local\|sync` |
| `history` | List versions from file recovery |
| `history:list` | List all files with local history |
| `history:read` | Read a version. Params: `version=` (default: 1) |
| `history:restore` | Restore a version. Params: `version=` (required) |
| `history:open` | Open file recovery |

### Workspace and Tabs

| Command | Description |
|---------|-------------|
| `workspace` | Show workspace tree. Params: `ids` |
| `workspaces` | List saved workspaces. Params: `total` |
| `workspace:save` | Save layout as workspace. Params: `name=` |
| `workspace:load` | Load workspace. Params: `name=` (required) |
| `workspace:delete` | Delete workspace. Params: `name=` (required) |
| `tabs` | List open tabs. Params: `ids` |
| `tab:open` | Open new tab. Params: `group=`, `file=`, `view=` |
| `recents` | List recently opened files. Params: `total` |

### Vault

| Command | Description |
|---------|-------------|
| `vault` | Show vault info. Params: `info=name\|path\|files\|folders\|size` |
| `vaults` | List known vaults. Params: `total`, `verbose` |
| `vault:open` | Switch vault (TUI only). Params: `name=` (required) |

### Other

| Command | Description |
|---------|-------------|
| `wordcount` | Count words/characters. Params: `words`, `characters` |
| `random` | Open random note. Params: `folder=`, `newtab` |
| `random:read` | Read random note. Params: `folder=` |
| `unique` | Create unique note. Params: `name=`, `content=`, `open` |
| `web` | Open URL in web viewer. Params: `url=` (required), `newtab` |

---

## 3. Developer Commands

**Source:** https://obsidian.md/help/cli (Developer commands section)

These commands help develop community plugins and themes. They allow agentic coding tools to automatically test and debug.

### `devtools`

Toggle Electron dev tools.

### `dev:debug`

Attach/detach Chrome DevTools Protocol debugger.

```bash
on                 # attach debugger
off                # detach debugger
```

### `dev:cdp`

Run a Chrome DevTools Protocol command.

```bash
method=<CDP.method>  # (required) CDP method to call
params=<json>        # method parameters as JSON
```

### `dev:errors`

Show captured JavaScript errors.

```bash
clear              # clear the error buffer
```

### `dev:screenshot`

Take a screenshot (returns base64 PNG).

```bash
path=<filename>    # output file path
```

### `dev:console`

Show captured console messages.

```bash
limit=<n>                        # max messages to show (default 50)
level=log|warn|error|info|debug  # filter by log level

clear                            # clear the console buffer
```

### `dev:css`

Inspect CSS with source locations.

```bash
selector=<css>     # (required) CSS selector
prop=<name>        # filter by property name
```

### `dev:dom`

Query DOM elements.

```bash
selector=<css>     # (required) CSS selector
attr=<name>        # get attribute value
css=<prop>         # get CSS property value

total              # return element count
text               # return text content
inner              # return innerHTML instead of outerHTML
all                # return all matches instead of first
```

### `dev:mobile`

Toggle mobile emulation.

```bash
on                 # enable mobile emulation
off                # disable mobile emulation
```

### `eval`

Execute JavaScript and return result. This runs code in the Obsidian app context, with access to the full `app` object including `app.vault`, `app.workspace`, `app.plugins`, etc.

```bash
code=<javascript>  # (required) JavaScript code to execute
```

Examples:
```shell
# Count files in vault
obsidian eval code="app.vault.getFiles().length"

# Get active file path
obsidian eval code="app.workspace.getActiveFile()?.path"

# Access plugin instance
obsidian eval code="app.plugins.plugins['my-plugin'].settings"

# Check if plugin is loaded
obsidian eval code="!!app.plugins.plugins['my-plugin']"
```

---

## 4. Plugin Development Workflow via CLI

**Source:** https://github.com/kepano/obsidian-skills/blob/main/skills/obsidian-cli/SKILL.md

### Develop/Test Cycle

After making code changes to a plugin or theme:

1. **Reload** the plugin to pick up changes:
```shell
obsidian plugin:reload id=my-plugin
```

2. **Check for errors** -- if errors appear, fix and repeat from step 1:
```shell
obsidian dev:errors
```

3. **Verify visually** with a screenshot or DOM inspection:
```shell
obsidian dev:screenshot path=screenshot.png
obsidian dev:dom selector=".workspace-leaf" text
```

4. **Check console output** for warnings or unexpected logs:
```shell
obsidian dev:console level=error
```

### Additional Developer Patterns

Run JavaScript in the app context:
```shell
obsidian eval code="app.vault.getFiles().length"
```

Inspect CSS values:
```shell
obsidian dev:css selector=".workspace-leaf" prop=background-color
```

Toggle mobile emulation:
```shell
obsidian dev:mobile on
```

### E2E Testing Pattern for Plugins

Using the CLI for plugin E2E testing:

```shell
# 1. Ensure plugin is installed and enabled
obsidian plugin:enable id=my-plugin

# 2. Reload after code changes
obsidian plugin:reload id=my-plugin

# 3. Clear error/console buffers
obsidian dev:errors clear
obsidian dev:console clear

# 4. Set up test state via eval
obsidian eval code="app.vault.create('test-note.md', '# Test')"

# 5. Execute plugin commands
obsidian command id="my-plugin:do-something"

# 6. Verify results
obsidian read path="test-note.md"
obsidian eval code="app.plugins.plugins['my-plugin'].someState"
obsidian dev:errors
obsidian dev:console level=error

# 7. Take screenshot for visual verification
obsidian dev:screenshot path=test-result.png

# 8. Clean up
obsidian eval code="app.vault.adapter.remove('test-note.md')"
```

---

## 5. REST API for CLI Commands

**Source:** https://github.com/dsebastien/obsidian-cli-rest/blob/main/docs/command-reference.md

The `obsidian-cli-rest` community plugin exposes all CLI commands as a REST API. Developer commands are marked as "dangerous" and require the `allowDangerousCommands` setting.

| Command | Method | Dangerous | Description |
|---------|--------|-----------|-------------|
| `devtools` | POST | Yes | Toggle Electron dev tools |
| `eval` | POST | Yes | Execute JavaScript and return result |
| `dev:console` | GET | Yes | Show captured console messages |
| `dev:errors` | GET | Yes | Show captured JavaScript errors |
| `dev:screenshot` | POST | Yes | Take screenshot (returns base64 PNG) |
| `dev:dom` | GET | Yes | Query DOM elements |
| `dev:css` | GET | Yes | Inspect CSS with source locations |
| `dev:mobile` | POST | Yes | Toggle mobile emulation |
| `dev:debug` | POST | Yes | Attach/detach CDP debugger |
| `dev:cdp` | POST | Yes | Run a CDP command |

---

## 6. Changelog Notes

### Obsidian 1.12.0 (2026-02-27)

**Source:** https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/

- Introduced the Obsidian CLI for scripting, automation, and integration with external tools.
- Developer commands available for plugin and theme development, allowing agentic coding tools to automatically test and debug.
- Installer updated to Electron v39.7.0.
- Added `appendBinary` method to vault and adapter API.

### Obsidian 1.12.7 (2026-03-23)

**Source:** https://obsidian.md/changelog/2026-03-23-desktop-v1.12.7/

- The Obsidian Installer is now bundled with a new binary file for CLI usage, replacing the old Electron binary method. Results in significantly faster terminal interactions. Requires downloading the latest installer.
- Added autocompletion for Obsidian commands to the TUI when using the `id=` parameter.
- Fixed CLI incorrectly checking for a Linux-specific directory on macOS.
- Changed CLI socket file to a hidden dotfile on macOS and Linux.
- Installer updated to Electron v39.8.3.

---

## 7. TUI Keyboard Shortcuts

### Navigation

| Action | Shortcut |
|--------|----------|
| Move cursor left | `Left` / `Ctrl+B` |
| Move cursor right (accepts suggestion at end of line) | `Right` / `Ctrl+F` |
| Jump to start of line | `Ctrl+A` |
| Jump to end of line | `Ctrl+E` |
| Move back one word | `Alt+B` |
| Move forward one word | `Alt+F` |

### Editing

| Action | Shortcut |
|--------|----------|
| Delete to start of line | `Ctrl+U` |
| Delete to end of line | `Ctrl+K` |
| Delete previous word | `Ctrl+W` / `Alt+Backspace` |

### Autocomplete

| Action | Shortcut |
|--------|----------|
| Enter suggestion mode / accept | `Tab` |
| Exit suggestion mode | `Shift+Tab` |
| Enter suggestion mode (fresh input) | `Down` |
| Accept first/selected suggestion | `Right` |

### History

| Action | Shortcut |
|--------|----------|
| Previous history entry / up in suggestions | `Up` / `Ctrl+P` |
| Next history entry / down in suggestions | `Down` / `Ctrl+N` |
| Reverse history search | `Ctrl+R` |

### Other

| Action | Shortcut |
|--------|----------|
| Execute command or accept suggestion | `Enter` |
| Undo/exit/clear | `Escape` |
| Clear screen | `Ctrl+L` |
| Exit | `Ctrl+C` / `Ctrl+D` |

---

## 8. Troubleshooting

- Ensure latest Obsidian installer version (1.12.4+).
- Restart terminal after CLI registration for PATH changes.
- Obsidian must be running; CLI connects to the running instance.

### macOS

Registration adds to `~/.zprofile`:
```
export PATH="$PATH:/Applications/Obsidian.app/Contents/MacOS"
```
For non-zsh shells (bash, fish), add to the appropriate config file manually.

### Windows

Requires Obsidian 1.12.4+ installer. Uses a terminal redirector (`Obsidian.com`) since Obsidian runs as a GUI app.

### Linux

Registration creates a symlink at `/usr/local/bin/obsidian`. For AppImage, symlink points to `.AppImage` file. For Snap, may need `XDG_CONFIG_HOME` set. For Flatpak, manual symlink may be needed.
