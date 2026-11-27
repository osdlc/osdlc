# workstation-cleaner: how the whole system works

Status: approved design, 2026-11-22. This covers workstation-cleaner from the first
version through the three tiers in #991. It was approved in the
review on #951. The plan that builds it is
`docs/planning/host-cleaner-plan.md`. All three tiers exist in code today;
`packages/ts/workstation-cleaner/docs/guide/how-it-works.md` says where the code differs.

It's ordered from simple to complex: first the core every tier shares, then
each tier, each one adding to the one before. A tag such as **(D2)** marks
behaviour settled by a review decision. The decisions are listed at the end
under "Decisions".

## In one paragraph

workstation-cleaner frees disk space on a developer machine.
- Every cleaner is a **plugin**.
- A plugin proposes **candidates**, the things it could delete, and may
  **object** to any plugin's candidates.
- The core:
  - puts every candidate into one **plan**,
  - checks everything again just before deleting,
  - asks the plugin that owns each candidate to delete it,
  - writes one **receipt**.

A person always runs it, and nothing runs on a schedule.

Plugins come in two forms, and both go through the same plan, checks and receipt:
- a **descriptor**, a YAML file with no code (tiers 1 and 2);
- a **code plugin**, written in TypeScript (built in, or loaded in tier 3).

## Words

| Word | Meaning |
| --- | --- |
| plugin | One cleaner, with a name, such as `git`, `cargo`, `pnpm` or `docker`. |
| descriptor | A plugin written as a YAML (or JSON) file. Each descriptor is its own plugin. |
| code plugin | A plugin written in TypeScript, either built in or loaded from a package. |
| store | One tool's data on disk, such as the pnpm store or the Go module cache. The system-cleanup research corpus (#992) describes 68 of them. |
| candidate | One thing a plugin could delete. Usually a folder, but it can also be something with no path of its own, such as a branch or a Docker volume. |
| objection | A plugin's reason not to delete a candidate. `refuse` blocks it, `protest` needs `--allow <code>`, and `note` only informs. |
| held | A candidate the default leaves out. It runs only when picked (`--pick` or `-i`). |
| root | A folder a plugin may delete inside. The core refuses anything outside it. |
| plan | Every candidate, its objections, and what the default would run. `plan -o` saves it. |
| receipt | What `clean` did, one sentence per candidate. |

The tiers, and the release each arrives in. User docs won't use the tier
names; this design does.

<!-- id: words-table2 -->
| Tier | What a person writes | Release |
| --- | --- | --- |
| Tier 1 | A descriptor with fixed folders per OS. Inside a folder, a glob pattern such as `models--*/` or `IntelliJIdea*/` makes each match its own candidate. The folders themselves are fixed, so the core always knows exactly where it may delete. | 2 |
| Tier 2 | A descriptor whose folders use `${VAR}`s, resolved on each run, so a moved store is found. | 3 |
| Tier 3 | A code plugin in a package your config names. | 4 |

Release 1 is the core and the built-in plugins, below.

## The core: what every tier shares

This is the first version. Every later tier adds plugins; none changes these
rules.

### The built-in plugins

| Plugin | What it cleans |
| --- | --- |
| `git` | Worktrees and branches in your targets that are merged or spent, through repo-cleaner. |
| `cargo` | Rust `target/` folders, and their `incremental` folders, that have been idle. |
| `node` | `node_modules` folders that have been idle. |
| `orca` | Works beside `git` on Orca's worktrees: refuses one with an agent at work, closes its terminals first, and has Orca forget it after. While Orca is down, its worktrees are refused. |

### Built-in plugins to add

Orca isn't the only tool that needs code. Any tool that keeps its own state
about a worktree needs it, for the same two jobs Orca does. It objects while a
worktree is open in the tool. And after a worktree is deleted, it removes the
state the tool kept about it (the `deleted` hook, or candidates for state whose
folder is gone). A file can do neither. Other tools need code because they hold
things that aren't folders, or because "unused" can only be found by asking
the tool.

<!-- id: more-builtins-table -->
| Plugin | What it would clean | Why it needs code | Cost |
| --- | --- | --- | --- |
| `vscode` | Per-workspace storage (`workspaceStorage/<hash>/`) for folders that no longer exist. Objects to deleting a worktree open in an editor window. | Each storage folder names its workspace in `workspace.json`, so finding the dead ones means reading every one. | re-download (settings and state) |
| `cursor` | The same for Cursor, a VS Code fork with the same layout. Its storage also holds chat history. | As `vscode`. | lost: held, needs `--allow` |
| `jetbrains` | Caches and indexes for projects that no longer exist, and folders of IDE versions no longer installed. | Project caches are keyed by name and a hash, and the installed versions come from the IDE's own records. | rebuild |
| `docker` | Unused volumes, dangling images and build cache. | None of these are folders you can safely delete; Docker must be asked what's in use and must delete them itself (refs, D10). | volumes lost; images and cache re-download |
| `ollama` | Models no recent run used. | Models are refs listed by `ollama list`, with `ollama ps` showing what's loaded. | re-download |
| `agent-history` | Claude Code's and Codex's per-project folders for worktrees that no longer exist. | Their folder names encode the worktree path, which must be decoded and checked. | lost: held, needs `--allow` |
| `toolchains` | Rust toolchains (rustup) and Node versions (nvm, Volta) no checkout in your targets asks for. | "Unused" means reading every checkout's `rust-toolchain` or `.nvmrc`. | re-download |

Simpler tools in the corpus, such as Homebrew, Xcode's DerivedData and the
simulators, and the language caches, fit a descriptor, so they need no plugin.
Each built-in above needs only the phase 2 contract, so it can ship in any
release after the first. All seven were chosen in review, and the plan has one task
for each. `docker` is also the example in tier 3, since a built-in is
written the same way as a package.

### Commands

```sh
workstation-cleaner status [target...]   # every candidate and what objects to it; deletes nothing
workstation-cleaner plan -o plan.json    # the same, saved
workstation-cleaner clean [--plan plan.json] [--pick <id>] [--spare <id|name|glob>] [--allow <code>] [-i] [--yes | --dry-run]
workstation-cleaner config               # every plugin's effective settings
workstation-cleaner plugins              # every plugin: where it came from, detected or not, roots, variables (D6)
```

`--plugin <name>` runs only the named plugins, and `--skip-plugin <name>`
leaves them out. Both work for every plugin, whatever its form, because each
descriptor is its own plugin.

workstation-cleaner refuses to start as root.

### What one run does

| Step | Who | What | Descriptor (tiers 1 and 2) | Code plugin (built-in or tier 3) |
| --- | --- | --- | --- | --- |
| load | core | Builds the plugin list: built-ins, then loaded packages, then descriptors. Validates every descriptor and every plugin's settings. | Read and checked against the schema. Tier 2: variables are resolved here, once per run. | Imported (tier 3) and its settings checked. |
| detect | each plugin | Does it apply here? | From `detect` (`onPath`, `exists`). With none, it applies when one of its folders exists. | Its own `detect` hook. |
| scope | each plugin | Adds folders to look in. | Not used. | Optional. Orca adds its repositories. |
| roots | each plugin | The folders it may delete inside. | Its `paths`: fixed in tier 1, resolved in tier 2. | Optional. Without roots, it may delete only inside your targets (D10). |
| discover | each plugin | Proposes candidates. | One candidate per folder, or per `glob` match inside it, plus `project` matches in your targets. | Its own logic, through `kit.candidate`. |
| object | each plugin | Objects to candidates. | Only to its own candidates, and only from `inUse`: a matching process or lock refuses them with `in-use`. It can't object to another plugin's candidates. | Any candidate, its own or another plugin's, at any level (`refuse`, `protest`, `note`). |
| decide | core | Applies `refuse`, `protest`, `held`, `ignore`, `--spare` and `--pick`. | Same for every plugin. The core adds its own objections: `outside-roots`, `unmeasured` (D11), and `discard-user-data` for `costDescription: lost`. | Same. |
| re-check | core | `clean` runs discover and object again, and drops what changed, vanished or is now refused. | Same. | Same. |
| prepare | every plugin | Runs before each delete. | Not used. | Optional. Orca closes a worktree's terminals. |
| delete | the owner | Deletes the candidate and returns the receipt sentence. | Done by the core: it runs the `command`, pointed at the folder (D13), or removes the folder. | Its own `delete` hook; folders through `kit.remove`. |
| deleted | every other plugin | Runs after each delete. | Not used. | Optional. Orca forgets a worktree's record. |

**In short:** a descriptor is a fixed set of answers to the same steps. The core does the work for it: it finds the folders, measures idle, checks `inUse`, and deletes. A descriptor objects only to its own candidates, through `inUse`, and never to another plugin's. Steps that need logic (`scope`, `prepare`, `deleted`, objecting to others) belong to code plugins.

**How hooks run (D2).** When workstation-cleaner asks a plugin something, such as
"what can you delete?", the plugin may answer straight away, or answer later
when it has had to wait for another program, such as Docker or Orca. In
JavaScript terms, the hook may be `async` and return a promise. Either way:
- Plugins are asked one after another, in plugin order, never at the same time.
- Each question has a time limit. When it runs out, workstation-cleaner cancels the
  work through `ctx.signal`, warns, and carries on, so a hung program can't
  hang the run.
- A timeout counts as that hook failing:
  - in `detect`, the plugin is left out with a warning;
  - in `object`, every candidate the plugin might have objected to is refused,
    as Orca does today when its list fails;
  - in `delete`, that step fails.

The built-in plugins answer straight away and barely change. Code that calls
workstation-cleaner's own `survey()` and `clean()` has to wait for their answers too,
which is why this lands before the first public release.

**Plugin order.**
1. The built-in plugins: `git`, `cargo`, `node`, `orca`.
2. Loaded code plugins, by name (tier 3).
3. Descriptors, by name (tiers 1 and 2).

Order decides which plugin keeps a candidate that two of them propose (see
"How the tiers meet"), and the order `prepare` and `deleted` run in.

### Where things live

workstation-cleaner keeps its files in three folders, from `@osdlc/tiered-dirs`'
`standalone('workstation-cleaner')` tier, under the `xdg` convention **(D5)**:

| What | Path, macOS and Linux | Moved by |
| --- | --- | --- |
| Config | `~/.config/workstation-cleaner/config.json` | `WORKSTATION_CLEANER_CONFIG_DIR`, or `XDG_CONFIG_HOME` |
| Your descriptors | `~/.config/workstation-cleaner/descriptors/<name>.yaml` | follows the config folder |
| Receipts | `~/.local/state/workstation-cleaner/receipts/` | `WORKSTATION_CLEANER_STATE_DIR`, or `XDG_STATE_HOME` |
| Log | `~/.local/state/workstation-cleaner/workstation-cleaner.log` | `WORKSTATION_CLEANER_LOGS_DIR` |

`WORKSTATION_CLEANER_ROOT` moves all three folders, which is useful for tests.

Today workstation-cleaner uses the `native` convention instead. On macOS that puts the
config under `~/Library/Application Support/host-cleaner/` and the log under
`~/Library/Logs/host-cleaner/`, and Linux is the same as above.

**Where plugins come from.** Every plugin, whatever its form, has one name in
one namespace. Two plugins with the same name are a load error, with one
exception: your descriptor replaces a shipped descriptor of the same name. That
lets you fix a shipped descriptor without waiting for a release.

| Source | What | Tier |
| --- | --- | --- |
| Built in | `git`, `cargo`, `node`, `orca`: code in the package. | core |
| Shipped descriptors | `descriptors/*.yaml` in the package: the reviewed first set (pnpm, uv, Go, Hugging Face Hub, Gradle, npm, pip, Yarn, Maven). | 1 and 2 |
| Your descriptors | `~/.config/workstation-cleaner/descriptors/*.yaml`: adds a tool, or replaces a shipped descriptor of the same name. | 1 and 2 |
| One run | `--descriptor <file>`: for writing and testing a descriptor. It replaces a descriptor of the same name for that run. | 1 and 2 |
| Loaded packages | `plugins.<name>.package` in config: code plugins installed beside workstation-cleaner. | 3 |

A repository can't add plugins or descriptors. Nothing a checkout holds can
load code, and nothing it holds can point a delete somewhere.

### The config file

There is one file, `config.json`. Every plugin, whatever its form, is
configured under `plugins.<name>`. This example uses every tier:

```json
{
  "targets": ["~/dev"],
  "ignore": ["~/dev/dashboard"],
  "idleHours": 24,
  "plugins": {
    "cargo": { "idleHours": 48 },
    "orca": { "repos": false },
    "pnpm": { "enabled": false },
    "go": { "vars": { "GOMODCACHE": "/Volumes/build/go/mod" } },
    "podman": { "package": "@acme/workstation-cleaner-podman", "keepVolumes": ["pgdata"] }
  }
}
```

- **`targets`** are the folders that the checkout-based plugins look in: `git`,
  `cargo`, `node`, and a descriptor's `project` entries. With none, they use the
  current directory. A descriptor's `paths` don't use targets.
- **`ignore`** lists paths nothing may be deleted in or below, for every plugin.
  `--ignore <dir>` adds to it.
- **`idleHours`** is the default for every plugin that has the setting. It
  takes any number from 0 up, so `0.5` is 30 minutes **(D7)**.
- **`plugins.<name>`** holds one plugin's settings. Each plugin has a strict
  schema, so a misspelt key is an error that names the plugin and the key.
  - An entry with `package` for a name no plugin has is an error.
  - Any other unknown name is a warning, since it may be for a descriptor you
    load only with `--descriptor`.
  - Today an unknown name is silently accepted, although the README says it's
    an error. This is a change.

The core handles these keys before a plugin's own schema sees the entry, so a
plugin never declares them:

| Key | For | Meaning |
| --- | --- | --- |
| `enabled` | every plugin | `false` leaves it out of every run. `--plugin <name>` runs it anyway. |
| `idleHours` | every plugin that has an idle threshold | Overrides the plugin's default. A plugin opts in with the kit's `idleHours` setting, and then inherits the top-level `idleHours` when it sets none. |
| `vars.<VAR>` | descriptors (tier 2) | A value for one of the descriptor's variables. It wins over every other source. A variable the descriptor doesn't declare is an error. |
| `package` | loaded plugins (tier 3) | The npm package to load it from. |

A code plugin's other settings are whatever its schema declares, as with
`orca`'s `repos` today. `workstation-cleaner config` prints every plugin's effective
settings, with defaults included.

### Safety rules for every plugin

- **Containment:** nothing outside a plugin's roots, or its targets for
  checkout-based plugins, is deleted. The core checks real paths when planning,
  and again before each delete.
- **Ignore and spare:** `ignore` and `--spare` apply to every candidate.
- **Re-check:** `clean` surveys again and compares each candidate's evidence. A
  candidate whose evidence changed is dropped as `changed`.
- **Data that can't be rebuilt:** `costDescription: lost` is held, and needs
  `--allow discard-user-data` **(D8)**.
- **In use:** a running process or a lock refuses the candidate.
- **Commands can't wander:** a tool's command runs from the home folder and is
  pointed at the folder the core checked **(D13)**, and a prune becomes a
  removal only when you allow it **(D12)**.
- **No root:** workstation-cleaner refuses to start as root, and `system: true`
  descriptors are skipped.
- **No scheduling:** a person runs every clean. `clean` asks before deleting,
  unless given `--yes`.

## Tier 1: descriptors with fixed paths

A descriptor is one YAML file per tool, named after the plugin: `uv.yaml` is
the plugin `uv`. It has no code and no variables. It names a tool's folders
directly, per OS, with `~` for the home folder, and workstation-cleaner turns it into
a plugin with the same hooks a code plugin has. YAML also reads JSON, and one
JSON Schema checks both.

### A first descriptor: uv

```yaml
# yaml-language-server: $schema=https://unpkg.com/@osdlc/workstation-cleaner@1/schemas/descriptor-1.json
descriptor: 1
store: uv # the research corpus slug it was drafted from; optional
detect:
  any: [{ onPath: uv }, { exists: cache }]
paths:
  cache: { all: ~/.cache/uv }
candidates:
  - path: cache
    costDescription: re-download
    command: [uv, cache, prune, --cache-dir, '{path}']
    removes: unused
inUse:
  processes: [uv]
```

What a run does with that file, on a Mac with uv installed:

1. **detect:** `uv` is on PATH, so the plugin applies.
2. **roots:** `~/.cache/uv`. Nothing outside it can be deleted.
3. **discover:** one candidate, `uv:~/.cache/uv`, with its size.
   - `removes: unused` says the command removes only what nothing uses (a
     prune). Such a candidate needs no idle check, so it's proposed on every run.
   - Its evidence is its path alone. A cache in daily use changes all the time,
     and that mustn't drop it as `changed` at the re-check.
4. **object:** while any `uv` process runs, it's refused with `in-use`.
5. **clean:** runs `uv cache prune --cache-dir ~/.cache/uv` from the home
   folder. `{path}` is the folder the core checked. Exit 0 is success, and the
   receipt gives the command and the size before and after.

A folder can differ per OS: `{ macos: ~/Library/Caches/pip, linux: ~/.cache/pip }`.
A path with no entry for the current OS doesn't apply there. Windows entries
are allowed but untested.

### A wipe, one candidate per entry: Hugging Face

Hugging Face's cache has one folder per model. A glob makes each model its own
candidate, judged idle on its own, and with no `command` the core removes the
folder:

```yaml
descriptor: 1
store: huggingface-hub
paths:
  hub: { all: ~/.cache/huggingface/hub }
candidates:
  - path: hub
    glob: 'models--*/'
    costDescription: re-download
    idleHours: 720
```

Each model folder that nothing changed in for 720 hours is a candidate. A model
folder used more recently is still listed, as held, so you can pick it. That
matches what `cargo` and `node` do today with folders that aren't idle.

### The fields

<!-- id: descriptor-fields-table1 -->
| Field | Required | Meaning |
| --- | --- | --- |
| `descriptor` | yes | The format version, `1`. |
| `store` | no | The `slug` of the store's entry in the system-cleanup research corpus (#992), such as `pnpm` (from `corpus/stores/pnpm.md`) or `huggingface-hub`. It records which research the file was drafted from, and the drafting script fills it in. workstation-cleaner doesn't use it when it runs. |
| `detect` | no | `any:` or `all:` of `{ onPath: <program> }` and `{ exists: <path name> }`. Default: any path exists. |
| `paths` | yes | Named folders, per OS (`macos`, `linux`, `windows`) or `all`. They may use `~`. These are the plugin's roots. |
| `candidates` | yes | What may be deleted (below). |
| `inUse` | no | `processes:` and `locks:`. A match refuses every candidate with `in-use`. |
| `project` | no | Build folders inside checkouts, for ecosystems with no code plugin (below). |
| `supersededBy` | no | A code plugin's name. When that plugin runs (detected, enabled and not skipped), this descriptor doesn't. |
| `system` | no | `true` marks data that needs root. It's accepted so the corpus can describe such stores, but the descriptor is skipped with a note. Cleaning as root is out of scope. |
| `vars` | no | Tier 2. Rejected until release 3. |

The plugin's name is the file name, so there's no `name` field to keep in step.
A descriptor's file name must not be a built-in plugin's name.

Candidate fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `path` | yes | A name from `paths`. |
| `glob` | no | Entries under the path, such as `models--*/` or `*/cache/`, one candidate each. Without it, the whole folder is one candidate. A glob may not climb out of the path (`..`). Past `maxEntries` (default 200), the rest are combined into one candidate, so a huge cache doesn't flood the plan. |
| `costDescription` | yes | What deleting it costs: `re-download`, `rebuild` or `lost`. `lost` is always held, and carries a `discard-user-data` protest that only `--allow` grants. |
| `idleHours` | no | How long it must sit unchanged before it's selected by default, in hours (`720` is 30 days). Default: the config's `idleHours`. A candidate that isn't idle yet is listed as held. Ignored with `removes: unused`. |
| `command` | no | The tool's own command, as an argv list. It runs only when its program is on PATH, from the home folder. It must name the checked folder, as a `{path}` argument or in `env` **(D13)**. It can't be combined with `glob`. |
| `env` | no | Environment entries for `command`, such as `{ GOMODCACHE: '{path}' }`. |
| `removes` | with `command` | `unused`: the command removes only what nothing uses (a prune). No idle check. Without the program, it's listed with a `no-prune-tool` protest: by default nothing happens, and `--allow no-prune-tool` removes the whole folder instead, with the idle check **(D12)**. `all`: the command empties the folder (a wipe). The idle check applies, and without the program the core removes the folder instead. |
| `held` | no | `true` leaves it out of the default, even when it's idle. |

### How candidates behave

**Ids.** Every candidate's id is `<kind>:<path>`, as in the core today; a
descriptor's kind is its plugin name. `status` shows the path with `~`, and
`--pick` and `--spare` accept that form, so ids are readable and typeable.

**Measuring idle.** Idle is the newest modification time under the candidate,
as for `cargo` and `node`, within a time budget per root. A candidate the
budget can't finish measuring gets an `unmeasured` protest **(D11)**, so it
runs only with `--allow unmeasured`. Whether the measurement finished stays out
of the candidate's evidence, so a slow folder doesn't show up as `changed` at
the re-check.

**In use.**
- `processes` match an executable's name, or any word of its command line. So
  `GradleDaemon` matches Gradle's daemon, which runs as `java`.
- The full command line is read, so Linux's 15-character process names don't
  matter.
- `locks` are files whose presence means in use. A folder there is a schema
  error.

A process that runs all day, such as a `pnpm dev`, refuses the store for as
long as it runs. That's on purpose: stop it to clean.

**Removing a folder.** When the core removes a folder, it first makes read-only
files writable. Go's module cache, for example, is read-only.

**Commands are pointed at the checked folder (D13).** Without this, a command
acts on wherever the tool is configured, not on the folder workstation-cleaner
checked: with `UV_CACHE_DIR` set in your shell, `uv cache prune` would prune
that other folder. So every `command` must name the checked folder, as a
`{path}` argument or an `env` entry. A command that names neither is a schema
error. A tool that can't be pointed at a folder (Gradle, Maven) gets folder
removal only.

### Build folders in checkouts

`project` entries list build folders beside a marker file under `targets`, with
the same idle and live-process rules as `cargo` and `node`:

```yaml
project:
  - { dir: bin, marker: '*.csproj', costDescription: rebuild }
  - { dir: obj, marker: '*.csproj', costDescription: rebuild }
```

Each entry has `dir` (the folder's name), `marker` (a file name or glob beside
it that marks the project), `costDescription`, and an optional `idleHours`. `cargo` and
`node` stay code plugins. `project` entries are for ecosystems that have none.

### Where the file lives, and tuning it

- **Shipped:** in the package, as `descriptors/uv.yaml`.
- **Your own:** `~/.config/workstation-cleaner/descriptors/uv.yaml`. The same name as
  a shipped one replaces it, and `workstation-cleaner plugins` says so.
- **One run:** `--descriptor ./uv.yaml`. To try one you're writing, use
  `workstation-cleaner status --descriptor ./uv.yaml --plugin uv`, which shows what it
  would propose and deletes nothing.
- **Tuning:** `plugins.uv.enabled: false` turns it off;
  `plugins.uv.idleHours: 336` changes its idle time.

### Drafting a descriptor from the corpus

A script in workstation-cleaner does this (q-compile). The corpus has quoted answers
for each store, and the script turns one store's answers into a first
descriptor file:

| Corpus subject | Becomes |
| --- | --- |
| data dirs, per OS, with their cost | `paths`, and one candidate each with `costDescription` (the corpus calls it `rebuild`) |
| location overrides | `vars` (tier 2), with `env` and `file` sources |
| clean command | `command`, with `removes` left for the reviewer |
| in use | `inUse` |
| project build dirs | `project`, skipping those a code plugin already covers (such as `node_modules`) |

The draft never sets `idleHours` or `removes`. A person reviews the draft, sets
those, and commits it. A store the corpus marks `system: true` gets
`system: true`.

### What tier 1 can't do

- **Find a moved store.** With `UV_CACHE_DIR=/Volumes/fast/uv` set, the file
  still looks at `~/.cache/uv`. If that folder exists, it holds old data and is
  cleaned. The moved cache is left alone, and nothing outside the named folders
  is touched. Tier 2 fixes this.
- **Ask the tool where its folder is,** as `pnpm store path` does. That's
  tier 2.
- **Run logic,** such as asking Docker which volumes are unused. That's tier 3.

## Tier 2: descriptors with variables

It's the same file, plus `vars`. A tool that lets people move its folder gets a
variable for it. The variable lists where to look, and workstation-cleaner works out
its value on each run, so a moved store is found.

### A first variable: pnpm's store

<!-- id: writing-a-descriptor-code1 -->
```yaml
descriptor: 1
store: pnpm
vars:
  STORE:
    - command: [pnpm, store, path]
    - value: { macos: ~/Library/pnpm/store, linux: '${XDG_DATA_HOME}/pnpm/store' }
paths:
  store: { all: '${STORE}' }
candidates:
  - path: store
    costDescription: re-download
    command: [pnpm, store, prune, --store-dir, '{path}']
    removes: unused
inUse:
  processes: [pnpm]
```

**What `STORE` is.** A name for a folder that workstation-cleaner works out on each
run. It tries each source in order and keeps the first answer:

1. `command: [pnpm, store, path]` asks pnpm where its store is. That finds a
   store you moved, for example with `store-dir` in `.npmrc`.
2. `value` is the default folder for each OS, used when pnpm isn't installed
   or the command fails.

`paths.store` then uses `${STORE}`, so the plugin's root is whichever folder
was found, and `{path}` points the prune at it. The name is local to this file;
`STORE` is just what this one calls it. In tier 1 the same file would say
`paths: { store: { macos: ~/Library/pnpm/store, linux: ~/.local/share/pnpm/store } }`
and could not find a moved store.

One detail to settle when the shipped file is written: `pnpm store path` prints
the versioned folder inside the store (such as `.../store/v10`), while
`--store-dir` takes the store itself. The example shows the shape.

Without `pnpm` on PATH, the prune can't run. The candidate is still listed, with a `no-prune-tool` protest, so by default nothing happens and `status` says why. If you want the store gone anyway, `--allow no-prune-tool` removes the whole folder instead, and then the idle check applies, as for a wipe **(D12)**.

### Several variables: Go

```yaml
descriptor: 1
store: go
detect:
  any: [{ onPath: go }, { exists: modcache }]
vars:
  GOPATH:
    - env: GOPATH
    - value: ~/go
  GOMODCACHE:
    - env: GOMODCACHE
    - command: [go, env, GOMODCACHE]
    - value: '${GOPATH}/pkg/mod'
  GOCACHE:
    - env: GOCACHE
    - command: [go, env, GOCACHE]
    - value: { macos: ~/Library/Caches/go-build, linux: '${XDG_CACHE_HOME}/go-build' }
paths:
  modcache: { all: '${GOMODCACHE}' }
  buildcache: { all: '${GOCACHE}' }
candidates:
  - path: modcache
    costDescription: re-download
    idleHours: 720
    command: [go, clean, -modcache]
    env: { GOMODCACHE: '{path}' }
    removes: all
  - path: buildcache
    costDescription: rebuild
    idleHours: 168
    command: [go, clean, -cache]
    env: { GOCACHE: '{path}' }
    removes: all
```

Variables may use each other (`GOMODCACHE` falls back to `${GOPATH}/pkg/mod`),
and each command is pointed at the folder that was checked.

### How a variable resolves

1. **Your config:** `plugins.go.vars.GOMODCACHE`, which always wins.
2. Then the descriptor's sources, in the order written:
   - `env`: an environment variable.
   - `file`: a key in a config file, as `{ file: ~/.config/x.toml, key: cache.dir }`. TOML, JSON and YAML are read. For a tool that keeps its paths in another format, such as npm's `.npmrc` (ini) or Maven's `settings.xml`, use the tool's own command instead (`npm config get cache`).
   - `command`: a command's output, trimmed. It runs during every survey, argv only, through `@osdlc/command-seam`, and only when the program is on PATH. It runs with the home folder as its working directory, so a checkout's own settings (`.npmrc`, direnv) can't steer it, and with a short timeout. A failure or timeout moves on to the next source.
   - `value`: a fixed value, which may use other variables and may differ per OS.

**Built-in variables** need no declaration, and have defaults when unset:
- `HOME`.
- `XDG_CACHE_HOME`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `XDG_STATE_HOME`.
  When unset, these default to the XDG values (`~/.cache`, `~/.local/share`,
  `~/.config`, `~/.local/state`) on every OS, because that's what the tools that
  read them do. Hugging Face uses `~/.cache/huggingface` on macOS too. A tool
  that uses macOS's own folders instead, as Go does with
  `~/Library/Caches/go-build`, gives a per-OS `value`.
- On Windows, `LOCALAPPDATA` and `APPDATA`.

A variable that ends with no value leaves its paths unresolved. Their candidates
don't appear, and `status` says which variable was missing. `workstation-cleaner
plugins` shows each variable's value and the source that gave it **(D6)**.

Commands also get every resolved variable in their environment, so a command
that reads one sees the value the core checked.

### Containment of resolved folders

A variable can point anywhere, so every descriptor path, fixed or resolved,
must sit strictly inside the home folder. The core refuses a path, with
`outside-roots`, when it:
- is the home folder itself;
- is a personal folder (`~/Documents`, `~/Desktop`, `~/Downloads`, `~/Pictures`, `~/Music`, `~/Movies`, `~/Library`, `~/.ssh`, `~/.config`);
- is a target or a checkout, or contains one;
- contains workstation-cleaner's own folders.

Nothing is deleted there.

The one exception is a value you set in your own config. It's trusted, so
`/Volumes/build/go/mod` in the config example is allowed. That's how a cache
moved to another disk gets cleaned.

## Tier 3: code plugins

Use a code plugin when a tool needs logic a file can't express: asking Docker
which volumes are in use, closing Orca's terminals, judging a git worktree. The
built-in plugins are code plugins already; tier 3 lets a package your config
names be one too.

<!-- id: tier3-language -->
**Language (D14).** A tier 3 plugin is JavaScript or TypeScript, loaded into
workstation-cleaner's own process. That keeps the kit, the types and zod shared
directly, and a plugin is one import. A program in any language speaking JSON
over stdin and stdout (as LSP and MCP servers do) would open tier 3 to Rust,
Python or a shell script. It would also give a real time limit, because a stuck
process can be killed. The cost is a protocol to design and version, a process
start per run, JSON Schema settings instead of zod, and the kit's helpers
exposed over the wire. The suggestion is to keep tier 3 in-process, but keep
every hook's input and output plain JSON. A stdio bridge can then be added
later as one built-in plugin that runs a program, with no change to the
contract. The contract suite checks that candidates and objections survive a
JSON round trip.

### The hooks

| Hook | When it runs | What it does |
| --- | --- | --- |
| `detect` | first | Does this plugin apply? |
| `scope` | before discover | Adds folders to look in. |
| `roots` | before discover | Folders it may delete inside, outside any checkout. |
| `discover` | | Proposes candidates. |
| `object` | after all discovery | Objects to any candidate (`refuse`, `protest`, `note`). |
| `prepare` | before each delete, on every plugin | Gets a candidate ready. A throw stops that candidate, and `FatalRun` stops the run. |
| `delete` | on the owner | Deletes it and returns the receipt sentence. |
| `deleted` | after each delete, on every other plugin | Tidies up after another plugin's delete. Best effort. |

Every hook except `detect` is optional. A candidate's `requires` lists the
candidates that must go first, such as a worktree before its branch.

### Path and ref candidates

A candidate is either a **path**, a folder `delete` removes, or a **ref**, a
thing with no folder of its own, such as a Docker volume or an Orca record
**(D10)**:
- A path candidate must sit inside the plugin's roots or inside a target, for
  every plugin. Otherwise it's refused with `outside-roots`.
- A ref candidate is deleted by name, with no folder checks.
- Git's branch candidates (which use `at` today) and Orca's records become
  refs. That's work on both plugins.

### Writing one: a Docker example

A package exports one `definePlugin` value **(D3)**. It holds the settings
schema and the factory together, and gets the plugin kit **(D4)**. This is
roughly the built-in `docker` plugin. The same code in a package of its own,
under a name no built-in uses, such as `podman`, is a tier 3 plugin:

```ts
import { definePlugin, z } from '@osdlc/workstation-cleaner/plugin'

export default definePlugin({
  name: 'docker',
  api: 1,
  settings: z.strictObject({ keepVolumes: z.array(z.string()).default([]) }),
  create({ settings, kit }) {
    return {
      async detect(ctx) {
        return (await kit.run(['docker', 'info'], { signal: ctx.signal })).ok
      },
      async discover(ctx) {
        const unused = await unusedVolumes(kit, ctx.signal) // your logic: docker volume ls, docker ps
        return unused
          .filter((v) => !settings.keepVolumes.includes(v.name))
          .map((v) =>
            kit.candidate({
              kind: 'volume',
              ref: v.name,
              why: 'no container uses it',
              costDescription: 'lost',
              evidence: { created: v.createdAt },
            }),
          )
      },
      async delete(c, ctx) {
        await kit.run(['docker', 'volume', 'rm', c.ref], { signal: ctx.signal, check: true })
        return `removed volume ${c.ref}`
      },
    }
  },
})
```

What the example relies on:
- `kit.candidate` fills in the id (`volume:<ref>`) and the owner.
- `costDescription: 'lost'` makes the core hold the volume and ask for
  `--allow discard-user-data`, as for a descriptor **(D8)**.
- `kit.run` goes through `@osdlc/command-seam`, so tests can replace it.
- `z` is re-exported, so the plugin's schema uses the same zod as the core.
- `create` also gets `env`, the command line's environment.

### The plugin kit

The kit **(D4)** is the set of safety helpers workstation-cleaner's own plugins use,
exported so a code plugin calls the same ones instead of writing its own
folder deletion:
- `kit.idle(path)`: how long since anything in the folder changed, with a time
  budget; `unmeasured` when it runs out (D11);
- `kit.remove(path)`: deletes a folder only if it's still inside the plugin's
  roots, after making read-only files writable;
- `kit.running(name)`: whether a program is running, by name or working
  directory;
- `kit.onPath(program)`: whether a program is installed;
- the `idleHours` setting, inherited from the config;
- `kit.candidate({...})`: builds a candidate with the right id and cost rules;
- `kit.run(argv)`: runs a program with a time limit and `ctx.signal`.

The descriptor engine uses nothing but these helpers, so a descriptor and a
code plugin get the same safety. Once exported, they're public API: changing
one later takes a major release.

### Testing a plugin

`@osdlc/workstation-cleaner/testing` **(D9)** gives a fake context, a fake command
runner, a temporary home, and one contract suite every plugin runs. The suite
checks that:
- ids are unique;
- evidence is stable across two surveys;
- `delete` returns a sentence;
- nothing is deleted outside the roots.

The built-in plugins and the shipped descriptors run the same suite.

### Loading a code plugin

```json
{ "plugins": { "podman": { "package": "@acme/workstation-cleaner-podman", "keepVolumes": ["pgdata"] } } }
```

- **Where workstation-cleaner looks:** the package is resolved from where workstation-cleaner
  is installed, then from the global npm prefix. So `npm i -g
  @acme/workstation-cleaner-podman` next to a global workstation-cleaner works. With `npx` or
  `pnpm dlx`, install both globally instead. workstation-cleaner never resolves a
  package from a checkout.
- **Checks at load:**
  - The config key must equal the plugin's `name`.
  - `api` must be one workstation-cleaner supports. A mismatch is an error that names
    the package and both versions. `api` changes only with a major release of
    workstation-cleaner.
- **If loading fails** (the package isn't installed, its import throws, or it
  exports the wrong shape):
  - `status` and `plan` warn and go on without it.
  - `clean` exits 2, naming `plugins.<name>.package`, unless you pass
    `--skip-plugin <name>`. A missing plugin's objections are missing too, and
    `clean` won't delete without them by accident.
- The plugin API is exported from workstation-cleaner and versioned with it.

## How the tiers meet

### Which tier to use

| You need | Use |
| --- | --- |
| Fixed folders per OS, idle checks, the tool's own clean command | Tier 1: a descriptor |
| Build folders beside a marker file in checkouts | Tier 1: a descriptor's `project` entries |
| Folders a person or the tool can move (env var, tool config, `go env`) | Tier 2: a descriptor with `vars` |
| To ask a program what's in use, talk to an API, close something before deleting, or object to other plugins' candidates by logic | Tier 3: a code plugin |

### One core, one set of rules

- **One core.** Descriptors and code plugins go through the same steps and the
  same safety rules.
- **Objections cross forms.** A `docker` code plugin can refuse a descriptor's
  candidate inside Docker's data folder while a container runs. Orca's plugin
  notes and refuses git's worktrees in the same way today.
- **Overlap (D1).** Two candidates with the same id, or the same real path, are
  one candidate.
  - The earlier plugin's stands, and the other is dropped with a warning that
    names both.
  - Code plugins run before descriptors, so code wins.
  - Nested candidates, such as `cargo`'s `target/` inside a git worktree, are
    both kept. The inner one is deleted first. If the inner one is refused,
    the outer one is refused too, since deleting it would delete the inner.
  - `supersededBy` turns a descriptor off entirely while its code plugin runs.
- **Names.** There is one namespace for every plugin. A descriptor and a code
  plugin for the same tool have different names, such as the built-in `docker`
  and a `docker-data` descriptor. They meet through the overlap rule and
  `supersededBy`.

## Releases

1. **The core:** `git`, `cargo`, `node` and `orca`, with no descriptors. Before
   its public release it's renamed (name to be chosen), switches to `xdg`
   **(D5)**, and its plugin API becomes async **(D2)**, so none of those is a
   breaking change later. Tier work and
   new built-ins finished before the rename are in it too.
2. **Tier 1,** with the first stores on their default folders.
3. **Tier 2,** with variables for those stores, and Go.
4. **Tier 3.**

Each is a minor release, out when its work merges. Root-only stores and
scheduled runs are recorded as later work in workstation-cleaner's backlog.

## Decisions

Every decision was made in review. The text above follows them.

| # | Question | Decision | Why |
| --- | --- | --- | --- |
| D1 | How are two plugins' candidates for the same thing matched? You answered "same candidate id, code plugin's kept", but ids rarely match across plugins. | The same id **or the same real path** is one candidate, and the earlier plugin's stands. Nested candidates are both kept, inner first, and an inner refusal refuses the outer. | Matching on id alone lets a code plugin and a descriptor delete the same folder twice. Dropping nested candidates would drop every `cargo` and `node` candidate inside a git worktree. |
| D2 | Make every hook async? | Yes, before the first public release. Add a per-hook timeout and `AbortSignal`, and run plugins one at a time. | `Plugin`, `survey` and `clean` are exported today, so changing them later is a major release. Loaded plugins that call APIs need it. |
| D3 | One `definePlugin` export per plugin? | Yes, and the built-in plugins move to it too. | The factory and the settings schema live in two maps today (`FACTORIES`, `PLUGIN_SETTINGS`). An author should learn one thing. |
| D4 | Export the plugin kit, and build descriptors only on it? | Yes. The helpers stay inside workstation-cleaner, exported as `@osdlc/workstation-cleaner/plugin`, and reuse repo-cleaner's and `@osdlc/path-guard`'s code. Splitting them into standalone inspection packages is possible later work. | A code plugin otherwise rewrites idle, removal and containment logic, with less care. |
| D5 | Switch workstation-cleaner's folders to `xdg`? | Yes, before the first release. | `tiered-dirs`' own guidance says a CLI uses `xdg` (`~/.config/<tool>`), and people keep it in their dotfiles. Nothing is released yet, so there's nothing to migrate. |
| D6 | Add `workstation-cleaner plugins`? | Yes. It lists each plugin's source, whether it was detected and why, its roots, and each variable's value and where it came from. | #991 put resolved variables in `config`, which mixes settings with discovery. Testing a descriptor needs no extra command: `status --descriptor <file> --plugin <name>`. |
| D7 | One unit for idle? | Keep `idleHours` everywhere, in the config and in descriptors. It takes any number from 0 up, so `0.5` is 30 minutes. | #991 used `idleDays` in descriptors. One unit in both places beats nicer numbers. A duration string (`30d`) was chosen, then reversed in review. |
| D8 | Make `costDescription` a core candidate field? | Yes, optional for code plugins, named `costDescription` (plain `cost` read as unclear). The core applies the `lost` rule to every candidate that sets it. | Otherwise the rule holds only for descriptors, and a code plugin must remember to set `held` and a protest itself. |
| D9 | Ship a testing kit with a contract suite? | Yes. | Plugin authors otherwise learn the contract by reading the core. |
| D10 | Add ref candidates, which have no folder? | Yes. Every plugin's path candidates must sit inside its roots or a target. Git's branches and Orca's records become refs. | Today a plugin with no `roots` gets no containment check at all (`run.ts:129`), and Docker volumes or Orca records have no folder to check. |
| D11 | A folder too large to measure in the time budget. You chose "held with a note" (q-idle). | Give it an `unmeasured` protest instead, so it runs only with `--allow unmeasured`, and keep the budget outcome out of the evidence. | Held still lets a pick delete it with no idle evidence. And whether the measure finishes can differ between plan and re-check, so the folder would flap as `changed`. |
| D12 | The tool's command when it's on PATH, otherwise remove the folder. You chose that (q-prefer). | A prune (`removes: unused`) never falls back on its own. Without the program it gets a `no-prune-tool` protest; `--allow no-prune-tool` removes the folder instead, with the idle check. Wipes (`removes: all`) still fall back. | A prune runs with no idle check. Falling back to a removal would wipe a whole pnpm store in daily use. |
| D13 | Must every tool command name the checked folder? | Yes: a `{path}` argument or an `env` entry, or the schema rejects it. | Tier 1 has no variables, so without this a command cleans wherever the tool is configured, such as a moved `UV_CACHE_DIR`, not the folder workstation-cleaner checked. |
| D14 | Must a tier 3 plugin be TypeScript, or can it be any program over stdio? | JavaScript or TypeScript, in-process, for tier 3. Keep every hook's input and output plain JSON, so a stdio bridge can come later as one built-in plugin. | In-process shares the kit and types directly, with no protocol to design. Plain JSON keeps the door open for other languages without a breaking change. |
| D15 | Must a version read what an earlier version wrote? | No, not before 1.0. No code reads an old config location, upgrades an old plan or file version, or keeps a renamed field working. An old plan is refused with "sweep again". | Before 1.0 the formats still change, and each migration is code to keep and test for users who don't exist yet. |

## Review log

These changes came from my own pass and an independent review against the
code, the corpus and #991.

| Change | Why |
| --- | --- |
| `cost` became `costDescription` (D8) | Asked for in review: `cost` alone read as unclear. |
| `docker` became a planned built-in | Chosen in review with six others. The loaded-package examples now use `podman`. |
| Tier 3's language made a decision (D14) | Asked in review: TypeScript only, or a stdio contract? |
| Reordered by tier, simplest first (revision 2) | Asked for in review: the core, then each tier adding to the one before. |
| Commands must name the checked folder (D13) | Found while writing tier 1, which has no variables to pass. |
| `rebuild:` became `costDescription:` | #991 had `rebuild: rebuild`. "Cost" is the corpus's own word for what deleting costs. The drafting script maps the corpus field to it. |
| `command` moved onto each candidate | #991's Go example had two candidates and one store-level command. |
| `removes: unused \| all` added | A prune and a wipe need different rules. A prune needs no idle check, and must never fall back to a removal. Without this, a machine without pnpm would have its whole store removed. |
| Commands run from the home folder | A checkout's `.npmrc` or direnv could steer a command run from inside it. |
| `paths` replaced #991's `roots` and `candidates[].root` | One name for named folders. "Roots" is already a hook with a different meaning. |
| `name` became the file name, with an optional `store` | Requiring the corpus slug broke tools outside the corpus, and `cargo`'s registry would have needed a built-in's name. |
| `detect`'s `command:` became `onPath:` | `command` meant a program name in `detect` but an argv list elsewhere. |
| A candidate that isn't idle is listed as held | Before, it vanished, unlike `cargo` and `node`. |
| An unmeasured folder gets an `unmeasured` protest | Holding it let a pick delete it with no idle evidence, and the budget outcome made large folders flap as `changed`. |
| `maxEntries` for globs | pip's HTTP cache can match thousands of entries. |
| Built-in `XDG_*`, `HOME`, `LOCALAPPDATA` variables | Every descriptor would otherwise declare them again. |
| ini and XML sources replaced by tool commands | npm, pnpm and pip keep paths in ini, and Maven in XML. Their own commands report the paths. |
| Personal folders, targets and checkouts are refused as paths | "Inside home" alone let a project's `.npmrc` with `store-dir=~/Documents` pass. |
| Read-only files are made writable before a removal | Go's module cache is read-only. |
| Load failures are specified | A plugin that doesn't load also loses its objections, so `clean` stops. |
| The core owns `enabled`, `package`, `vars` and `idleHours` | The loading example failed its own strict schema. `idleHours` inheritance worked only by key name, and nothing documented it. |
| Unknown plugin names are flagged as a change | The README says they're an error, but the code accepts them. |
| Loaded plugins are ordered by name | Config order is JSON key order, which nobody controls on purpose. |
| `$schema` is pinned to `descriptor-1` and the major version | An unpinned URL drifts, and the package will be renamed. |
| host-cleaner refuses to run as root | The doc said it never does, but nothing enforced it. |
| `plugins check` was dropped | `status --descriptor <file> --plugin <name>` does the same job. |
| `supersededBy` was defined for a disabled code plugin | It applies only while that plugin runs. |
