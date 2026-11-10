# dsh-archive-manager

Batch management for **archived chats** in the DeepSeek Harness Web UI.

The plugin adds an *Archived chats* page inside **Settings** — open the account
menu at the sidebar foot and choose Settings, then pick **归档会话 / Archived
chats** in the settings navigation. The page lists every archived Session with
its title, folder, last update, and log size, and offers:

- **Search** by title or folder.
- **Multi-select** (per row, filtered select-all) with **Restore** and **Delete**.
- **Restore** — drops the Session from the durable archive set, so it reappears
  in its Workspace at its original position.
- **Delete** — refuses Sessions that are still live or running; the Session log
  directory moves into a trash folder (`$DSH_HOME/archived-sessions-trash`) and
  the archive entry, Workspace accounting, cached projections, and every
  connected client's list row are cleared. A confirmation can instead ask for
  permanent deletion of the log files.

Nothing is inferred from the DOM: the panel reads and writes through the
plugin's own authenticated Host route (`/api/archive-manager`), which in turn
uses `ctx.workspaceRegistry` for archive state and the composed Session
persistence backend's on-disk layout for the log directories.

## Install

Install straight from the public repository as a profile bundle:

```text
plugin_manager install_bundle target=git+https://github.com/yixin2021/dsh-archive-manager.git
```

Or, from a local checkout of this repository:

```bash
dsh plugin install .
```

The package declares `dsh.bundle.patch` (`./cordis.patch.yml`) and a web client
half, so the plugin manager wires both halves without extra configuration.

## Configuration

The bundle patch inserts one row. Every setting is optional — an empty value is
derived from the current DSH home, which is the layout the composed persistence
backend and the projection cache already use:

```yaml
- insert:
    - id: archive-manager
      name: 'dsh-archive-manager'
      config:
        sessionsRoot: ''         # default $DSH_HOME/sessions
        trashRoot: ''            # default $DSH_HOME/archived-sessions-trash
        projectionCacheRoot: ''  # default $DSH_HOME/storages/session_projcache/sessions
```

## Host API

`POST /api/archive-manager` with one of:

| Body | Result |
| --- | --- |
| `{ "action": "list" }` | archived Sessions, counts, roots |
| `{ "action": "restore", "ids": [...] }` | per-Session results plus a fresh snapshot |
| `{ "action": "delete", "ids": [...], "permanent": false }` | per-Session results plus a fresh snapshot |

Failure reasons per Session: `not-archived`, `live`, `missing-log`, `failed`.

## Notes and limits

- **Why a Settings page.** The account popup menu (the avatar's right-click
  menu) is hardcoded in `@deepseek-ai/dsh-client-ui-settings-account`: its items
  are `settings` / `contact` / `signin` / `signout` with no additive slot, and
  the one seat it declares (`settings.launcher`) is a single seat that *is* the
  account row itself — claiming it would replace the account button. Settings is
  therefore the nearest additive destination reachable from that menu: click the
  avatar → **Settings** → **归档会话 / Archived chats**. The page is registered in
  `settings.section` at `order: 30`, after General, Models, and Plugins.
- **Deleting removes the row immediately.** A Session removed out of band never
  emits `session/disposed`, so the Host half also emits `api-session/removed`
  for each Session it deletes; connected clients drop the row (and the sidebar
  stops offering it) without a reload.
- Deleting a Session does not rewrite any other Session log; a fork that
  references the deleted Session as its parent keeps its own log and only
  loses the parent pointer's target.
- The Session query index is not modified; it reconciles from the persistence
  listing on the next read.
