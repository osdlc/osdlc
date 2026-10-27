# @osdlc/wayfinder

## 0.11.3

### Patch Changes

- Updated dependencies [82d9841]
- Updated dependencies [ebe0e0d]
  - @osdlc/typed-git@0.11.0
  - @osdlc/trust-repo@0.5.2

## 0.11.2

### Patch Changes

- bb61f10: The version `--version` prints is now stamped from package.json at build time by `cli-tool-stamp-version` instead of read from package.json at run time.
- Updated dependencies [bb61f10]
  - @osdlc/cli-tool@0.11.0

## 0.11.1

### Patch Changes

- a4a2021: The `$schema` URL that `way config set` writes, and the `$id` of the shipped `schema/config.json`, now follow the package version's `major.minor`, so they name `@osdlc/wayfinder@0.11` in this release line. They had stayed at `0.10`. `CONFIG_SCHEMA_URL` is now typed `string` instead of a string literal.

## 0.11.0

### Minor Changes

- da5e6a3: `way clean` now compares real paths, through `@osdlc/path-guard` (a new runtime dependency), when it checks a store against the home directory, against another store, and when it prunes empty directories above a removed store. A store that holds the home directory only through a symbolic link above it (a store under `~/alias/...` where `alias` links to a directory that holds the home) is no longer removed. Two stores that overlap only through a symbolic link now need `--yes`, and an old pre-release path that reaches a current store through a link is no longer listed as old.

### Patch Changes

- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
- Updated dependencies [da5e6a3]
  - @osdlc/command-seam@0.14.0
  - @osdlc/typed-git@0.10.0
  - @osdlc/detect-harness@0.7.0
  - @osdlc/cli-tool@0.10.1
  - @osdlc/system-model@0.7.1
  - @osdlc/trust-repo@0.5.1

## 0.10.1

### Patch Changes

- e5265bc: Clearer wording in the README and the terminal UI and web view guides about the skills progress line and the runner time limit.

## 0.10.0

### Minor Changes

- b835ae4: `way clean` no longer removes a store that holds the home directory under a directory whose name starts with `..` (such as `..x`). `way --cached --no-exec` now re-probes a runner whose stored rows were taken with exec allowed, instead of reporting it as fresh with no tasks.
  Through `@osdlc/cli-tool` and `@osdlc/command-seam`, a working directory that cannot be entered now exits with the `repository` code instead of `missingTool`.
  Behaviour change (stricter): a task handed the terminal (`way run`, the terminal UI, the web view's Run) whose program is a bare name now runs it only from an absolute `PATH` entry; a relative entry, which would find a file the repository ships, is skipped and the run fails as a missing binary. A path such as `./gradlew` runs as given. The web view's "handed off" message quotes the command line as the copy text does.
  `~` expansion of the user config path and of tool module paths now uses `@osdlc/tiered-dirs`'s `expandTilde`; the result on each platform is unchanged.
  The JSON documents' schemas take every enum that names a `@osdlc/system-model` value (group ids, cache states and stale reasons, probe costs, parameters-unknown reasons, match modes, tool roles and runner kinds) from system-model's `ALL_*` lists instead of a copy, so a value system-model adds is accepted. The values are unchanged; in the `providers` document's schema the role enum now lists `packageManager` first, in system-model's order. The terminal filter's control-character set comes from `@osdlc/ux`'s `controlPattern`; the characters it replaces are unchanged.
  `way config get` of a key under a listed setting returns the nested value instead of exiting 1.
  Behaviour change (through `@osdlc/cli-tool`): `way config get` and `way config unset` of an unknown key exit 2 (a usage error, with a did-you-mean) instead of 1, as `set` and `explain` already did. `way config get` of a key under a listed setting reads it from that setting's value.
- ebd5328: Loading finishes sooner and a hung tool no longer holds it up.
  
  - New setting `runners.timeout`: how many seconds one runner may take to list its tasks, its subprocesses included. Set it in your user config (`way config set --user runners.timeout 20`), from 1 to 3600. A project file, or the web view's settings page, can only lower the limit: each runner takes the smaller of the project value and its own limit (or your user value). A project value above your user value is ignored with a warning. A runner still running then is stopped, the processes it started are killed, and it shows `timed out after 20 s` in place, in the terminal UI, the web view and `list --json`, like any failed runner. Unset or `null`, each runner has its own limit (10 s for just, 120 s for moon, 60 s for most). That limit now bounds the whole probe, not only each subprocess.
  - The agent skills and the Skills tab appear while the runners load, not at the end. `list --progress` sends them on a `catalog-progress` line of their own, with `skills`, filtered like the final document. The terminal UI shows them with the first task rows, below them.
  - The final status shows as soon as the last runner answers. The store is written after that, in the background, and every normal exit waits for it. A kill during the write leaves the old entry in place.
  - Library: `CatalogProgress.onSkills`, called once as soon as the skills are read.
  - The config file's `$schema` URL moves to `@osdlc/wayfinder@0.10`.

### Patch Changes

- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [b835ae4]
- Updated dependencies [ebd5328]
- Updated dependencies [fdef74f]
  - @osdlc/cli-tool@0.10.0
  - @osdlc/command-seam@0.13.0
  - @osdlc/config-layers@0.8.0
  - @osdlc/detect-harness@0.6.0
  - @osdlc/etag-write@0.3.0
  - @osdlc/system-model@0.7.0
  - @osdlc/tiered-dirs@0.5.0
  - @osdlc/trust-repo@0.5.0
  - @osdlc/typed-git@0.9.0
  - @osdlc/ux@0.1.1

## 0.9.0

### Minor Changes

- f6993bf: The terminal UI and the web view draw at once, and with no saved listing they show each runner's tasks as that runner answers.
  
  - **Terminal UI:** the frame appears before anything is read. With no saved listing, each runner's rows arrive as it answers. A runner still loading has `…` in place of its tab's count and a `… moon  loading` line in the list, and the status line names them: `loading 3 of 12: just, mise, moon`. A withheld runner shows its reason as soon as it answers. A failed one gets ` !` on its tab and its reason above the rows. While rows arrive, the cursor stays on its task, so Enter runs the row on screen. Over a saved listing the status line says `refreshing…` until every runner has answered, then the rows update in place; after 3 seconds it names the runners still out. The store is no longer read before the first probe, since that costs as long as the probe's own detection.
  - **Web view:** `way serve` prints its address without waiting for a probe. With no saved listing, the page's first read joins the server's probe and draws each runner as it arrives, with a loading tab and row for each runner still out, each in its final place, and the same `loading N of M` count in the status. A live region tells a screen reader when loading starts and ends. The lines stream as NDJSON over the same API, token and Host and Origin checks as every other call. Over rows already shown it says `refreshing…`.
  - **Library:** `buildCatalog` takes `progress: { onRunners, onRunner }`, which hears about each runner as it answers. The `CatalogProgress` type is exported. The document it returns is unchanged.
  - **CLI:** `list --progress --output jsonl` prints a `catalog-progress` line as each runner answers, before the reports. `way schema` describes it. Over HTTP the same lines stream as NDJSON. A report over about 1 MiB is named in `omitted` instead of sent.
  - `list --json` and `list --output jsonl` print what they printed before.
  - With a grant for one tool, the trusted and the withheld runners are now collected at the same time.

### Patch Changes

- df47065: The config file's `$schema` URL now names the 0.9 release line. Point an existing `$schema` at
  `https://unpkg.com/@osdlc/wayfinder@0.9/schema/config.json`; the 0.8 URL keeps working.
- Updated dependencies [7addea1]
- Updated dependencies [f013f38]
- Updated dependencies [f6993bf]
- Updated dependencies [f013f38]
  - @osdlc/cli-tool@0.9.1
  - @osdlc/command-seam@0.12.1
  - @osdlc/system-model@0.6.0
  - @osdlc/typed-git@0.8.2

## 0.8.0

### Minor Changes

- d243a32: wayfinder is now a command tree: `way list`, `way query`, `way run`, `way serve` and `way providers`, with `way help`, `way schema <command>` and `way --version` from `@osdlc/cli-tool`. Every `--json` answer is a document with `schemaVersion` and `kind`, and `@osdlc/wayfinder/schema` exports the JSON Schema of every document (`trust`, `clean`, `config-*`, `error` and the rest included) plus `documentZod(kind)` to parse one.
  
  New:
  
  - `way run <id> [-- args]` runs one task by its id or command line, binding arguments as the terminal UI does, and exits with the task's exit code. `--dry-run --json` prints the plan.
  - `list` and `query` take `--declared` and `--depth N` beside `--services`.
  - The `catalog` and `query` documents carry `unknowns`: each withheld runner, task with unknown parameters, stale stored answer and missing tool, with the same `label` the stderr note prints.
  - Each `cache` entry has `probeMs` after a fresh probe.
  
  Breaking changes, and what to do:
  
  - `way query --json` prints a `query` document, not a bare array. Read its `tasks` field.
  - `way providers --json` prints a `providers` document, not a bare array. Read its `providers` field.
  - `--json` always carries `cache`, `unknowns` and `filter`, and `schemaVersion` and `kind`. A strict parser must allow these fields; `documentZod('catalog')` does.
  - `--serve`, `--list` and `--json` are aliases for `serve`, `list` and `list --json` in this release and will be removed later. Switch scripts to the commands. Two of them at once is now an error.
  - A start directory that does not exist is an error (exit 1) instead of an empty catalog. Check the path.
  - Every message on stderr starts with `way:`, not `wayfinder:`: the commands, the terminal UI, the web view server and an uncaught error. Update any pattern that matches the prefix.
  - The package has an `exports` map, so deep imports into `dist/` no longer resolve. Use `@osdlc/wayfinder/schema` for the schemas.
- d243a32: Config, trust, guide and clean move onto `@osdlc/cli-tool`'s shared commands.
  One Zod schema now validates the config file, sets its key order and generates
  `schema/config.json`.
  
  New:
  
  - `way config explain <key>` shows how a setting got its value, layer by layer.
  - `way config set` writes `$schema` into the file, keeps the schema's key
    order and writes atomically.
  - An unknown key in a config file warns with the closest known key.
  - New user-only settings: `open` (`tui` or `web`), `theme` (`system`, `light`
    or `dark`) and `trust.tools.<tool>` (`paths` and `owners` for one tool).
  - `way trust --scope <tool>` and `way trust --untrust-all`.
  - `WAYFINDER_ROOT` moves the config, state and cache directories under one
    directory. `WAYFINDER_CONFIG_DIR`, `WAYFINDER_STATE_DIR` and
    `WAYFINDER_CACHE_DIR` move one each.
  - `way clean --dev` removes `way dev` link state and the shims
    `way dev install` wrote. `way clean --legacy` removes files left under the
    tool's old name.
  - `way clean` prunes empty parent directories, and names a config file that
    `WAYFINDER_CONFIG` chose before removing it.
  
  Breaking changes, and what to do:
  
  - The old `waypost` names are no longer read: `WAYPOST_CONFIG`,
    `~/.config/waypost/config.json`, `waypost.config.json` and the old trust
    store and cache. Move any settings you still need into the wayfinder files,
    then run `way clean --legacy` to delete the old files.
  - `way clean --all` is now `way clean --everything`.
  - `way clean --config` is now `way clean --user-config`. `--config` is the
    global flag that loads tool modules.
  - `way config set --project` refuses `allowExec: true`, `trust`, `open` and
    `theme`, as the web view does. Set them with `--user`.
  - The MCP adapter cannot grant trust. Over HTTP a grant needs a
    confirmation: the server answers `428` with a nonce, and the web page asks
    the person before it sends the grant again with that nonce. Neither
    adapter can run `clean` removals or change `trust`, `allowExec` or
    `tools`. Use the command line.
  - `way trust --json` now prints
    `{action, changed, roots: [{root, trusted, by, rule?, scope?}]}` for every
    mode, `--list` included. Read `roots[0]` where you read the top-level
    fields before. `way trust --show` text is `trusted <root> (by marker)`.
  - `way clean --json` now prints `{mode, stores}`.
  - `way dev` link state is under `$XDG_CONFIG_HOME/way` on macOS too, and its
    directory variables are `WAYFINDER_ROOT` and `WAYFINDER_<KIND>_DIR` (they
    were `WAY_ROOT` and `WAY_<KIND>_DIR`). Run `way dev link` again on macOS,
    then `way clean --legacy` to remove the old state.
  - A `~` at the start of an `XDG_*` variable is no longer expanded. Use an
    absolute path.
- d243a32: The terminal UI and the web view show their first rows at once again, and `list --cached` is fast and says that its rows are cached.
  
  - Each `list`, `query` and refresh saves the catalog it showed in one file under the cache directory (`views/v1/`), one file per trust and settings. The terminal UI and `way serve` draw that file first, then probe and update in place. Reading the stored probes instead detects the project and hashes each runner's files, which took more than two seconds on a large repository before the first frame. A file that is too large or not a saved listing is deleted and the store is read instead. `way clean --cache` removes them all.
  - A task from a saved or stored listing is checked before it runs: its runner is probed again, and a task that is gone, or whose command or directory changed, is refused with the command it runs now. This applies to Enter in the terminal UI before its first probe ends, to Run in the web view, and to `way run --cached`. A dry run is a preview and is not checked. A task whose directory is outside the repository is never run.
  - `way serve` holds its catalog between the page's requests. The page's first `list --cached` gets the catalog the server read at start, and its first fresh read and its polls join the probe already running. Refresh always starts a probe. A probe stops when the server stops, including when Run hands the terminal to a task, and a tab that closes does not stop a probe other tabs wait on.
  - The terminal UI's first frame counts the Skills group, as later frames do.
  
  Breaking changes, and what to do:
  
  - `--cached` on `list`, `query` and `run` now answers from the last saved listing when there is one, and does not check whether files changed since its `storedAt`. stderr says so: `--cached: the last listing, 35s old; files changed since storedAt are not checked`. With no saved listing it reads the stored probes and checks them, as before. If you need files checked, drop `--cached`: a full listing probes every runner.
  - The `list` and `query` documents gain two required fields. `source` is `"fresh"` when every runner was probed in this call and `"cached"` when the rows came from the saved listing or the store under `--cached`; `storedAt` is when the oldest stored rows were probed, or null when fresh. `--cached` with nothing stored still probes, and then says `"fresh"`. Code that builds a `CatalogDocument` must set both fields.
- d243a32: Safety fixes for running `way` in a repository you do not control.
  
  - `way clean` removes only what it owns. A file store must be a file and a directory store a directory, and no store may be your home directory, a directory above it or a filesystem root. It names the path it refused and exits 1. A store whose path is, holds or sits in another store, such as `WAYFINDER_CACHE_DIR=~/.config`, is removed only with `--yes`; without it `way clean` names both paths and exits 2.
  - Copy, in the terminal UI and the web view, puts the task's argv on the clipboard quoted for your shell. The web view copied the Command column as it was, so a script named `x; touch PWNED #` pasted as two commands. A command or skill name that holds a control character is not copied at all.
  - The web view shows repository text with control characters replaced, as the terminal does, so a bidi override cannot make a row read differently from what runs.
  - The web page is served with a strict content security policy: only its own script runs, and it talks only to the server.
  - `POST /session` and `/run` read their bodies as a stream and stop at 64 KB.
  - A boot token redeemed a second time, such as the old link opened in a second tab, is refused with `401`. `way serve` prints a warning and keeps running; pages already signed in stay signed in. If you did not open the link twice, stop the server (Ctrl-C) and start it again: a new link does not sign out a program that used the old one.
  - The browser opener no longer blocks the server, and `way serve` opens a browser on Windows.
  - A config file must be a regular file of at most 1 MB.
  - Writing a user config that is a symbolic link writes the link's target, so a dotfiles link stays a link.
  - While a task runs, `way` ignores `SIGTERM` and `SIGHUP` as well as Ctrl+C and waits for the task, instead of leaving it running with no parent. An argv the system cannot spawn, such as one holding a NUL, is reported instead of crashing.
  - On Windows, a user config at `~\.config\wayfinder\config.json`, where 0.7 kept it, is no longer read: 0.8 reads `%APPDATA%\wayfinder\config.json`. Every run warns until you move it. `way clean --legacy` finds the 0.7 Windows stores, and computes every old path the way old releases did, ignoring the `WAYFINDER_*` overrides.
  - A `__proto__` key in a config map is ignored with a warning. A leading `~\` is expanded on Windows.
  
  Breaking changes, and what to do:
  
  - `way clean --user-config` removes a file `WAYFINDER_CONFIG` names only when its `$schema` names wayfinder's config schema, as every file `way config set` writes does. Add the `$schema` line, or remove the file yourself.
  - Over HTTP, a command given a directory positional (`{"dir": ...}`) is refused with `400`. The web view reads the directory `way serve` started in.
  - `way run <id>` refuses an id that two tasks share (`ambiguous-task`, `409` over HTTP) and names the line `way list` prints for each. Run the task by that line instead, as in `way run 'npm run build'`. The web view sends only the id, so it cannot run such a task.
- d243a32: wayfinder lists agent skills, trusts single tools, says what each tool is, and can be used as a library.
  
  New:
  
  - A Skills group lists the agent skills in `.claude/skills`, `.agents/skills` and `.cursor/skills`, read by `@osdlc/detect-harness` without running anything. `list` and `query` print a `/<name> [hint]` line for each, and the `catalog` and `query` documents carry them in `skills`. Search matches a skill's name and description. `way run /<name>` explains that an agent runs skills. The user setting `skills` chooses `project` (the default), `all` (adds your own and your plugins' skills from the home folder) or `off`.
  - Per-tool trust decides which runners run in a repository that is not trusted as a whole. `way trust --scope <tool>` trusts one tool, and `trust.tools.<tool>` in the user config does the same by path or owner. A runner needs its own id trusted, plus each tool manager that runs commands through itself: in a repository with a `mise.toml`, moon needs `mise` too. A withheld runner's entry in `unknowns` lists the grants it still needs in `missing`.
  - `way providers` shows each tool's language and homepage, and `--json` adds `homepage`, `description`, `ecosystem` and `language`.
  - The root entry `@osdlc/wayfinder` exports `buildCatalog`, which returns the same document as `way list --json`, plus `filterTasks`, `filterSkills`, the groups, the labels, `terminalSafe` and the document types, with the system-model types they take. `buildCatalog`'s `onWarning` gets the config warnings the CLI prints on stderr.
  - Terminal text also replaces the bidi marks U+061C, U+200E and U+200F with U+FFFD, the same characters `@osdlc/ux` `stripControls` removes.
  
  Breaking changes, and what to do:
  
  - The `catalog` and `query` documents have a required `skills` array, and `groups` can hold a `skills` group with no runners. A strict parser must allow them. Set `skills` to `off` to list none.
  - A withheld unknown's `reason` can be `tool-untrusted`, and it can carry `missing`. Handle the new value where you switch on `reason`.
  - `way providers` text has two more columns, `language` and `homepage`. Read `--json` instead of parsing the table.
  - A project file's `skills` is ignored with a warning, as `theme` is. Set it in your user config.
- d243a32: The terminal UI gets a help screen, editable settings and clearer marks.
  
  New:
  
  - `?` lists every key and what each mark means. The footer fits the width and always keeps `? help` and `esc quit`. `way --help --all` prints the same key list.
  - The settings screen (`,`) edits runners (on or off, and their order), discovery and excluded paths, and grants or removes trust. Each change is saved at once and the list is probed again. The screen scrolls. Each runner shows why it has no rows, or its tool's language, homepage and description.
  - `^d` keeps declared tasks only and `^o` cycles the scope (all, root, +2, +3), as the web view's Declared and Scope filters do.
  - A task whose parameters could not be read is marked `?`, names the reason, and Enter asks for arguments; an empty line runs it as it is. A VS Code task that uses an editor variable is not run, and says why.
  - The bare `way` opens the web view when the user config sets `"open": "web"`. `way browse` always opens the terminal UI.
  - The status line shows the measured probe time after a probe.
  - A `skills` tab lists the repository's agent skills, which the `all` tab shows after the tasks. Enter and `^y` copy `/<name>`; nothing runs.
  - The settings screen shows each tool's language, homepage and description, and a TOOL TRUST section that grants or removes trust for one tool (`t`, then `y`; `u`).
  
  Changed:
  
  - The selected tab is marked `[name n]`, a withheld runner's tab shows `–` in place of its count, and the tab row scrolls to keep the selected tab in view. Every mark is text, so the screen reads the same under `NO_COLOR`.
  - Colors come from `@osdlc/ux` tokens. `NO_COLOR` turns color off but keeps bold, underline and inverse on a terminal. Matches are bold and underlined; yellow is only for warnings.
  - `^y` copies the argument vector quoted for your shell (`commandString` from `@osdlc/command-seam`), not the display text. The copy runs in the background with a two-second limit and tries `wl-copy` under Wayland, then `xclip` and `xsel`.
  - Keys typed right after an arrow or another escape sequence are no longer lost, and more Home and End sequences work.
  - SIGTERM, SIGHUP and SIGQUIT restore the terminal and exit with 128 + the signal number.
  - Argument splitting keeps a backslash inside single quotes, as sh does. Inside double quotes a backslash escapes only `"`, `\`, `$` and a backtick.
  - The withheld note reads `2 runners withheld: this repository is not trusted (^s to trust)`, and under `--no-exec` it names the flag and does not offer trust.
  
  Breaking changes, and what to do:
  
  - An argument typed as `'a\b'` now passes `a\b`, not `ab`. Drop the backslash, or move it outside the quotes, if you relied on the old result.
  - Copied text quotes each word and no longer contains `<placeholders>`. Add the arguments after pasting.
  - A `SIGINT` sent to the terminal UI exits 130, as the CLI does, not 0. Ctrl-C and Esc typed in the UI still exit 0. A script that sends `SIGINT` and checks for 0 must accept 130.
- d243a32: Web view sign-in, CLI text and wording fixes for 0.8.0.
  
  - The web page stays signed in across a reload: it keeps its token in `sessionStorage`, which belongs to one tab and is never sent with a request. A new tab, another browser or a restarted server shows how to get a new link: press Enter in the `way serve` terminal, which opens or prints a fresh sign-in link. The terminal is read only while `way serve` is in the foreground, so `way serve &` keeps serving.
  - `way list` and `way query` print each task as Copy puts it on the clipboard: quoted for the shell, with a `cd` for a task that runs from its own directory. `way run` accepts that line as well as an id, its usage shows `[-- <args>...]`, and the run document gains `command`, the line the text form prints.
  - Every withheld runner is named on stderr as `way: warning: <runner>: withheld: <cause>`, whatever the cause, with the same label the JSON, terminal UI and web view show. The exec-off label names what turned execution off (`--no-exec was given`, or `allowExec is false in your user config`). The trust hint follows once, only when a grant would help. Notes about unknown parameters and missing tools are warnings.
  - A task that uses an editor variable is labelled `cannot run here: the task uses an editor variable`.
  - `way list --json | head` exits quietly instead of printing a stack trace.
  - The old `--list`, `--json` and `--serve` flags print a deprecation warning.
  - Runner ids give way to group labels (`dependencies`, not `package-manager`) in the terminal UI's row chain, the web search chain, tab info buttons and settings. The Skills tab has its own column headers, status keys and search placeholder, and the terminal UI footer reads `enter copy /name` on a skill row.
  - Smaller wording and layout fixes: the bare `way` without a terminal starts its error with `way:`; the terminal UI's `?` screen wraps at narrow widths and its status line keeps a warning in view; the web settings say `Order: alphabetical` and show a tool's language as the terminal UI does; the trust bar has one colon; `way clean` keeps its columns aligned; at phone width the selected tab stays in view and names get more room.
  
  Breaking changes, and what to do:
  
  - `way list` and `way query` text changed. A script that matched the old `display` text, such as `sh -c bundle exec puma -p $PORT`, now gets `sh -c 'bundle exec puma -p $PORT'`. Read `display` from `--json` if you need the old form.
  - The `label` of an exec-off unknown in `--json` changed from `withheld: execution is off` to name the cause. Match on its `reason` (`exec-off`), not the label text.
- d243a32: The web view now runs every action as a command of `way` over HTTP, so the page and the command line read and write the same files with the same rules.
  
  Breaking changes, and what to do:
  
  - The page's own API routes are gone (`/api/catalog`, `/api/trust`, `/api/config`, `/api/run`). The page calls `POST /api/commands/<command>` (`list`, `trust`, `config list`, `config set`, `config unset`), and Run uses `POST /run`.
  - The `x-wayfinder-token` header is replaced by `Authorization: Bearer`. The page gets the token by sending the boot token to `POST /session`; it is no longer embedded in the page.
  - The theme and a dragged runner order are saved to your user config (`theme`, `runners.order`) instead of the browser. A project's `runners.order` still wins.
  
  Other changes:
  
  - A trust grant from the page asks first: the server answers `428` with a one-time nonce. Writes of `allowExec`, `trust` and `tools` are refused over HTTP and shown read-only in Settings, each with its command.
  - Settings shows the effective `allowExec`, and Save names each key and the file it was written to. Theme and `open` are editable there.
  - At phone width the toolbar wraps, the filters fold into one **Filters** menu and the tabs scroll on one row.
  - A task whose parameters could not be read is marked `?`, and Run asks for optional arguments. `Shift+Enter` runs a task and `?` opens the help, which lists the keys and opens at the top.
  - Colors come from `@osdlc/ux`, text is at least 11px, control borders meet 3:1 contrast, and each copy button names what it copies.
  - A Skills tab and group list the repository's agent skills. Copy, Enter and Shift+Enter put `/<name>` on the clipboard; nothing runs.
  - Each runner's info and its Settings row show its tool's description, language and homepage.
  - Settings grants or removes trust for one tool, with the same confirm as a repository grant.
  - `way list --json` carries `trustedTools`: the tools trusted on their own.
  - Ctrl-C stops `way serve` and any probe it is running. After a run, `way serve` exits with the task's exit code.

### Patch Changes

- d243a32: - The README and the checkout guide give the devlink state path for each platform: `${XDG_CONFIG_HOME:-~/.config}/way` on Linux and macOS, `%APPDATA%\way` on Windows.
  - wayfinder's tests run on Windows in CI. Windows is tier 2: the job reports and does not block a release.
- 9616994: Ctrl-C, `SIGTERM` and `SIGHUP` stop a running probe and the processes it started, in the CLI, the TUI and `way serve`. Each probe now runs in its own process group, so before this a probe kept running after wayfinder exited.
- 9616994: The `trust.paths` expander and the `origin` owner lookup now come from `@osdlc/trust-repo`. Behaviour is unchanged, with two exceptions. `--no-exec` no longer runs `git remote get-url` for `trust.owners`. And a `trust.paths` pattern of `/*` now expands to `/*`; it used to give `//*`, which matched nothing.
- Updated dependencies [9616994]
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [d243a32]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
- Updated dependencies [9616994]
  - @osdlc/cli-tool@0.9.0
  - @osdlc/command-seam@0.12.0
  - @osdlc/detect-harness@0.5.0
  - @osdlc/system-model@0.5.0
  - @osdlc/tiered-dirs@0.4.0
  - @osdlc/trust-repo@0.4.0
  - @osdlc/ux@0.1.0
  - @osdlc/typed-git@0.8.1
  - @osdlc/config-layers@0.7.3

## 0.7.4

### Patch Changes

- Updated dependencies [1a44195]
  - @osdlc/typed-git@0.8.0

## 0.7.3

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0
  - @osdlc/cli-tool@0.8.1
  - @osdlc/system-model@0.4.2
  - @osdlc/typed-git@0.7.2

## 0.7.2

### Patch Changes

- 910deca: Security fixes. Upgrade if you run `way` in repositories you did not write.
  
  - The installed `way` no longer runs code from the directory you stand in. It used to hand off to any directory above the cwd that had a `src/cli.ts`, and ran it under Bun before trust was checked. It now hands off only to the checkout `WAY_HOME` names (an absolute path) or `way dev link` linked, and only when that checkout's `package.json` is named `@osdlc/wayfinder`. `bun` is found on absolute `PATH` entries only, so a `bun` the repository ships is never run. That checkout runs under Bun with `--no-env-file` and an empty config, so the `.env` and `bunfig.toml` of the directory you stand in can no longer set the environment or preload code. `WAY_CWD_DEV` no longer does anything. If you develop wayfinder, run `way dev link` in your checkout once. `way dev` still works but no longer shows in `way --help`.
  - A relative `WAYFINDER_CONFIG` (or `WAYPOST_CONFIG`) is now ignored with a warning, and the XDG path is read. Run from the repository root, a relative value named a file in the repository as your user config, which can turn execution on and load tools. Use an absolute path, or `~/`. A relative `XDG_CONFIG_HOME`, `XDG_STATE_HOME` or `XDG_CACHE_HOME` is ignored, as the XDG spec says, and a relative `HOME` counts as unset, so the user config, trust store, cache and dev link are never looked up under the cwd.
  - Detection and the `origin` owner lookup run the `git` found on absolute `PATH` entries only, so a `git` the repository ships is never run through a relative `PATH` entry or, on Windows, the current folder. The owner lookup also runs git with `core.fsmonitor` off. Clipboard and browser helpers, and the `on PATH` column of `way providers`, use the same lookup. A tool found only through a relative `PATH` entry (`bin`, `.`, `node_modules/.bin`) now reads as not installed; put an absolute entry for it on `PATH`.
  - The terminal UI, `--list`, `query`, the `trust`, `config`, `providers` and `dev` output, the `--serve` summary and every stderr line now replace control characters (C0, DEL and C1) and bidi controls (U+202A-202E, U+2066-2069) in repository text with U+FFFD. A task name or doc comment could carry escape sequences that write the clipboard or set the window title, or text that displays in a different order from what runs. Copied commands get the same text. `--json`, `way dev … --json` included, keeps every value exact and now writes DEL, C1 and bidi controls as `\u` escapes, so it is safe to print to a terminal. An error no command catches is printed the same way, with exit code 1.
  - A `trust.owners` entry now matches the host as well as the owner. A bare `my-org` means `github.com/my-org` and no longer trusts a clone from `gitlab.com/my-org` or `bitbucket.org/my-org`. To trust an owner on another host, write `gitlab.com/my-org`. Owner trust believes the repository's own `.git/config`, so it fits clones you made yourself; `trust.paths` is the stronger form. The docs now say so.
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
- Updated dependencies [910deca]
  - @osdlc/cli-tool@0.8.0
  - @osdlc/command-seam@0.10.0
  - @osdlc/config-layers@0.7.1
  - @osdlc/system-model@0.4.1
  - @osdlc/trust-repo@0.3.0
  - @osdlc/typed-git@0.7.1

## 0.7.1

### Patch Changes

- Updated dependencies [007d8ee]
- Updated dependencies [96b7144]
- Updated dependencies [3f0455e]
- Updated dependencies [b5aac07]
- Updated dependencies [41ef520]
  - @osdlc/cli-tool@0.7.0
  - @osdlc/config-layers@0.7.0
  - @osdlc/system-model@0.4.0
  - @osdlc/typed-git@0.7.0

## 0.7.0

### Minor Changes

- e5a7a98: First release from osdlc, as `@osdlc/wayfinder`. The package was renamed from `@osdlc/waypost` before its first npm release. The command is still `way`. `way` browses and runs every task in a repository from one list, in a terminal UI, a live web view, `way query`, `--list` and `--json`. It is rebuilt on `@osdlc/system-model` in place of `@osdlc/detect-runners`.
  
  - **Groups.** Besides runner tasks, every surface shows the commands system-model synthesizes from the detected package managers, tool managers and git-hook managers: Tasks, Dependencies, Tools and Git hooks, in that order. The tab bars show a break between groups, and `--json` adds a `groups` array of `{id, title, runners}`.
  - **`way providers`.** Lists every registered tool with its roles, runner kind, binary, whether the binary is on PATH, and whether it is built in or custom. `--json` gives the same rows.
  - **Your own tools.** `--config <module>` loads a module that exports `tools`, an array of `ToolDef`s, for one run. The `tools` config key loads modules every run: from the user file always, from the project file only when the repository is trusted and execution is allowed. `way guide extend` has an example.
  - **Arguments.** Typed arguments are bound by each tool's `invoke(task, args)`, so `npm run` gets them after `--`.
  - **Node.** Runs on Node 22.22+, 24.15+ and 26; Bun is no longer required. The web view is served through `node:http` and the page script is bundled at build time. Running a development checkout through `way dev` still needs Bun.
  - **Rename.** Every path and name moved from `waypost` to `wayfinder`. The old ones are still read when the new ones are absent, with a warning. When both an old and a new config file exist, the new one is read and a warning says the old one is ignored:
    - project file: `wayfinder.config.json`, falling back to `waypost.config.json`.
    - user file: `$XDG_CONFIG_HOME/wayfinder/config.json`, falling back to `$XDG_CONFIG_HOME/waypost/config.json`.
    - config variable: `WAYFINDER_CONFIG`, falling back to `WAYPOST_CONFIG`.
    - trust store: `$XDG_STATE_HOME/wayfinder/trusted/`. Grants in `$XDG_STATE_HOME/waypost/trusted/` still count. `way trust --untrust` and `way clean --trust` remove a grant from both.
    - cache: `$XDG_CACHE_HOME/wayfinder/`, with no fallback. The first run re-probes. `way clean --cache` also removes the old `$XDG_CACHE_HOME/waypost/`.
  - **Names.** The devlink state directories take their overrides from `WAY_ROOT`, `WAY_CONFIG_DIR` and the other `WAY_*` variables, in place of `FLEET_*`, and the vendor segment is `wayfinder` in place of `com.sizerllc`. A link made with `way dev link` before the rename must be made again, and `way dev install` writes a `wayfinder` shim beside `way`. Subcommand usage and hints name the `way` command.
  
  Behaviour changes for existing users: the stored probe cache uses system-model's layout, so the first run after upgrading re-probes. Runners that must be executed (moon, mise tasks, sbt) are reported only when the repository uses them. The config files and the trust store moved, with the fallbacks listed under Rename. The web view's settings screen refuses to write `tools`; use `way config set tools`.

### Patch Changes

- Updated dependencies [e5a7a98]
  - @osdlc/system-model@0.3.0

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.6.3] - 2026-10-06 (unpublished)

#### Fixed

- The devlink directories are spelled out in the package.

### [0.6.2] - 2026-09-18 (unpublished)

#### Added

- A user-layer `trust` block, with `trust.paths` and `trust.owners`, trusts a class of repositories
  without a per-repository marker. A project file cannot set it.
- `way trust --show` and `--json` report which layer decided (`by`) and the matching rule (`rule`).

### [0.6.1] - 2026-09-14 (unpublished)

#### Fixed

- Fixes in the command-line front end.

### [0.6.0] - 2026-09-14 (unpublished)

#### Changed

- Breaking: exit codes follow one rule. `2` means the command cannot run as typed, `1` means a
  well-formed command failed. Scripts that checked other codes must update.

### [0.5.0] - 2026-09-13 (unpublished)

#### Changed

- Breaking: flags are declared once and both help tiers come from that list. An unknown flag is now
  a usage error instead of being ignored.

### [0.4.4] - 2026-09-13 (unpublished)

#### Fixed

- The CLI runs on the shared `@osdlc/cli-tool` package. No change in behaviour.

### [0.4.3] - 2026-09-11 (unpublished)

#### Added

- `way dev`: run the installed `way` from a development checkout, with `install`, `link`,
  `history`, `use` and `status`.

### [0.4.2] - 2026-09-06 (unpublished)

#### Changed

- `--help` prints the short form. `--help --all` prints every flag.

### [0.4.1] - 2026-09-05 (unpublished)

#### Added

- `way trust --json` and `way clean --json` print one JSON document.

### [0.4.0] - 2026-09-05 (unpublished)

#### Removed

- Breaking: the `waypost` command. The package installs one command, `way`.

### [0.3.10] - 2026-09-04 (unpublished)

#### Added

- `way query <terms>` searches tasks from the shell and exits 1 when nothing matched.

### [0.3.9] - 2026-09-03 (unpublished)

#### Fixed

- Ten defects across the terminal UI, the web view and the settings screen. A flag given on the
  command line now survives a settings save.

### [0.3.8] - 2026-09-02 (unpublished)

#### Fixed

- Muted text in the web view meets WCAG AA contrast.

### [0.3.7] - 2026-09-01 (unpublished)

#### Added

- The settings screen shows execution settings, and the runner order can be reset.

### [0.3.6] - 2026-09-01 (unpublished)

#### Fixed

- Web view styling.

### [0.3.5] - 2026-09-01 (unpublished)

#### Added

- The settings screen writes changes behind an explicit Save.

### [0.3.4] - 2026-09-01 (unpublished)

#### Added

- A read-only settings screen in the web view and the terminal UI.

### [0.3.3] - 2026-08-31 (unpublished)

#### Added

- A recipe that takes arguments asks for them, then runs.

### [0.3.2] - 2026-08-31 (unpublished)

#### Added

- `--exclude-path` leaves a path out of discovery.

### [0.3.1] - 2026-08-31 (unpublished)

#### Fixed

- The runner picker's checkbox column lines up.

### [0.3.0] - 2026-08-31 (unpublished)

#### Changed

- Breaking: the tool is named waypost. The command, the config file `waypost.config.json`, the
  `WAYPOST_CONFIG` variable and the state directories use the new name.

### [0.2.7] - 2026-08-31 (unpublished)

#### Fixed

- The withheld-runners notice has its own bar in the web view.

### [0.2.6] - 2026-08-31 (unpublished)

#### Fixed

- The web view says when runners were withheld.

### [0.2.5] - 2026-08-31 (unpublished)

#### Added

- A probe cache for slow runners. Both surfaces paint from the store, then refresh, and mark stale
  rows.

### [0.2.4] - 2026-08-31 (unpublished)

#### Added

- docker-compose and GitHub Actions runners.

### [0.2.3] - 2026-08-31 (unpublished)

#### Changed

- The runner picker sorts by selection.

### [0.2.2] - 2026-08-31 (unpublished)

#### Added

- rake, go-task and gradle are read by asking the tool, when execution is allowed.

### [0.2.1] - 2026-08-31 (unpublished)

#### Added

- Three more runners, and a `guide` command.

### [0.2.0] - 2026-08-30 (unpublished)

#### Changed

- Breaking: a repository must be trusted before runners that execute its configuration run.

### [0.1.2] - 2026-08-30 (unpublished)

#### Added

- The web view can run a task in the server's terminal, behind a token handshake.

### [0.1.1] - 2026-08-30 (unpublished)

#### Fixed

- The web view's script bundles the library from source.

### [0.1.0] - 2026-08-30 (unpublished)

#### Added

- A terminal UI and a live web view over every task in a repository.
