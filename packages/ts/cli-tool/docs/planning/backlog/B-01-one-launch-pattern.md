---
type: backlog
schema_version: '3'
id: B-01
tags:
  - cli-tool
  - devlink
  - sdlc
last_reviewed: '2026-10-31'
---
# CLI launch: one pattern across cli-tool and sdlc, and the decisions left

Every CLI we ship answers one question at startup: which copy of me should run? This item writes
down how that works today, where sdlc differs from the other CLIs, and the decisions still open,
so the launch pattern can end up as one simple rule set. All the CLIs are meant to be on npm
eventually, so the project layer matters for all of them.

Written 2026-10-31, after [#580](https://github.com/osdlc/osdlc/pull/580) (cli-tool 0.14) and
[sksizer/dev#3901](https://github.com/sksizer/dev/pull/3901) (sdlc's layers moved in-process).
Decisions 1, 2 and 10 are done in [#592](https://github.com/osdlc/osdlc/pull/592). sdlc and the
other dev CLIs live in [sksizer/dev](https://github.com/sksizer/dev); paths such as
`solutions/ontological/…` and `lib/…` are in that repository. How sdlc launches today is in
[How sdlc launches](../../guide/sdlc-launch.md).

In this item `<TOOL>` is the tool's env-var prefix (`SDLC`, `WAY`, `VAULT_TRIAGE`) and `<tool>` is
its command (`sdlc`, `way`, `vault-triage`). Layer names are the ones the code and `--where` use.

## The model

At startup a CLI takes the first of these that applies:

1. `env`: you said so for this shell, with `<TOOL>_HOME=/path/to/checkout`.
2. `cwd`: you are inside a checkout of the tool. Only sdlc turns this layer on.
3. `link`: you said so until you undo it, with `<tool> dev link <checkout>` (undo: `<tool> dev
   off`).
4. `project`: the project has its own copy in `node_modules`.
5. `local`: otherwise, the copy you started. `--where` calls this "this install" or "this checkout".

`<tool> --where` says which copy ran and which layer chose it. If decision 5 below drops the `cwd`
layer, the model is four lines. The full reference, with diagrams and how other tools do it, is
[launch-order.md](../../guide/launch-order.md).

## What exists today

**cli-tool devlink (osdlc, 0.14).** A hook that `runMain` calls before `main`. This section and the
next describe 0.14; 0.15 adds decisions 1, 2 and 10.

| Order | Layer | On by default | Runs |
|---|---|---|---|
| 1 | `env` (`<TOOL>_HOME`) | yes | that checkout's source, under bun |
| 2 | `cwd` (a checkout of the tool above the cwd) | no, opt-in per tool with `cwdLayer`; only sdlc sets it | that checkout's source, under bun |
| 3 | `link` (the `dev link` file) | yes | the linked checkout's source, under bun |
| 4 | `project` (`node_modules/<pkg>` above the cwd) | yes, when the spec sets `packageName` | that copy's built bin, under node (or bun if its `#!` says so) |
| 5 | `local` | — | — |

- Hand-off replaces the process with `process.execve` on macOS and Linux (Node 22.15+, Bun).
  Windows, and Node without `execve`, use `spawnSync`, where a signal sent only to the outer process
  can orphan the child.
- The `running …` line prints only on a hand-off, and for the `project` layer only when the versions
  differ.
- A tool's spec can name suppressors: env vars that, when set, turn off layers 2–4. `<TOOL>_HOME`
  always applies. Only sdlc and the determined apps name any (see the switches table).
- cli-tool answers `<tool> dev …` itself (`runDevCli`), in the copy you invoked.
- Under Deno nothing hands off.

**Who uses it.** In osdlc: `way`, `pr-update`, `repo-cleaner`, `markdown-contract`. In dev: `dfv`,
`dev-ports`, `diffkit`, `manifest-graph`, `markdown-vault-astro`, `markdown-vault-query`, the six vault
apps (`mail-sync`, `todo-sync`, `vault-digest`, `vault-engine`, `vault-graph`, `vault-triage`),
`family` and `sdlc`.

**Per-tool switches today.**

| Switch | What it does | Which tools |
|---|---|---|
| `<TOOL>_HOME` | the `env` layer | all |
| `<TOOL>_QUIET=1` | silences the `running …` line | all |
| `<TOOL>_PROJECT=0` | turns off the `project` layer | tools whose spec sets `packageName` (not sdlc) |
| `SDLC_CWD_DEV=0` | turns off the `cwd` layer | sdlc |
| `<TOOL>_LAUNCH_LAYER` | internal: the layer a hand-off came from; the hook reads and deletes it | all |
| `SDLC_LAUNCHER=1` | internal: set by `cli/sdlc`, so the layers apply only to a run through it | sdlc |
| `CLAUDE_PLUGIN_ROOT` (suppressor) | turns off layers 2–4 under the Claude plugin harness | sdlc only |
| `FAMILY_ROOT` (suppressor) | turns off layers 2–4 under the desktop app (these apps don't turn on `cwd`, so in effect `link` and `project`) | `family` and the six vault apps |

## How sdlc differs

| | Other CLIs | sdlc |
|---|---|---|
| Entry | the bin's `#!` line picks the runtime | `cli/sdlc`, a hand-written bash runtime picker: source under bun in a checkout, the built `sdlc.js` under node in a plugin pack. It is needed because the source uses `@lib/` path aliases that only bun or the build resolve, and every skill calls `${CLAUDE_PLUGIN_ROOT}/cli/sdlc` without naming a runtime |
| Layers | cli-tool's hook | cli-tool's hook, wrapped by `lib/services/dev/launch.ts` |
| `cwd` layer | off | on (off under `SDLC_CWD_DEV=0`) |
| `dev …` | answered by cli-tool's `runDevCli` | sdlc's hook returns null for `dev`, so sdlc's own `lib/services/dev/ops` answer it |
| Missing `node_modules` in a chosen checkout | no check in the hook (cli-tool's old bash launcher template had one, `need_deps`) | refuses with "Run 'bun install' there" (a copy of `need_deps`, in TypeScript) |
| Which bun a hand-off uses | the first `bun` on PATH | under bun: the bun already running, because the first `bun` on PATH can be a proto shim, which refuses to start bun a second time. Under node (the plugin pack's `sdlc.js`): the first `bun` on PATH, like the others |
| Running the source directly (`bun cli/sdlc.ts`) | layers apply | layers are skipped; they apply only through `cli/sdlc` (`SDLC_LAUNCHER=1`) or a hand-off. Without this, sdlc's tests ran the user's linked checkout |
| `project` layer | works once published | none yet: checkout detection uses the package name at the checkout root, and sdlc's root is the monorepo's |
| Compiled binary | `family` ships only as a compiled binary, and it runs the hook (that is why `FAMILY_ROOT` is a suppressor) | the compiled entry (`solutions/ontological/scripts/compiled/sdlc-compiled.ts`) skips the hook, and that binary is what npm installs (decision 7) |
| Hand-off cost | starts, then replaces itself | about 0.40 s, against 0.25 s with the old bash launcher, because the first process loads sdlc's module graph first |
| The launch layer | read once by the hook (loop guard), then deleted from the env | the hook also stores it in the process (`setLaunchLayer` in `lib/util/launch-layer.ts`); the orchestrator reads it with `launchLayer()` |

**The vault apps** (the six above) list `FAMILY_ROOT` as a suppressor, so the desktop app's sidecar
can't be redirected by a link or a project copy. `family` does the same
([sksizer/dev#3892](https://github.com/sksizer/dev/pull/3892)).

## Decisions to make

Each has a recommendation. 1, 2 and 10 are done, in cli-tool 0.15; the rest are open.

1. **Use the running bun for a hand-off, in cli-tool.** Any tool run under bun can hit the proto
   shim loop. Done in [#592](https://github.com/osdlc/osdlc/pull/592); sdlc's copy goes when it
   moves to cli-tool 0.15.
2. **Refuse a checkout that is missing `node_modules`, in the hook.** cli-tool's bash launcher
   template already had this check (`need_deps`), but the in-process hook did not. Done in
   [#592](https://github.com/osdlc/osdlc/pull/592), which also exports `missingDependency` and
   `installDir`; sdlc's copy goes when it moves to cli-tool 0.15.
3. **sdlc's own `dev` commands.** sdlc answers `dev …` with its own ops, not cli-tool's
   `runDevCli`. Options:
   - A: switch sdlc to `runDevCli`, after comparing the two command sets (verbs, output, link file).
     This is a behaviour change for `sdlc dev`.
   - B: keep sdlc's own `dev` ops.
   Recommendation: compare first; switch only if `runDevCli` covers what `sdlc dev` does.
4. **Running the source directly skips the layers.** sdlc added this rule; the other tools don't
   have it. The same test hazard may exist there: a test that runs `bun src/cli.ts` while the
   developer has a `dev link` set could run the linked copy instead. Options:
   - A: make it cli-tool's rule for every tool. "You ran this file, so you meant this file."
   - B: keep it sdlc-only, and have tests isolate the link (empty `HOME`, `<TOOL>_HOME` unset).
   Recommendation: A, after checking whether any tool's tests are affected today.
5. **Drop the `cwd` layer.** Only sdlc uses it. Without it, a checkout is chosen only by
   `<TOOL>_HOME` or `dev link`, and the model is four lines. Cost: working inside the sdlc repo
   would need `sdlc dev link .` (or `SDLC_HOME`) once. Recommendation: drop it, unless working
   inside the sdlc checkout without a link is a daily need.
6. **Cut the per-tool switches.** Keep `<TOOL>_HOME`, `<TOOL>_QUIET` and `<TOOL>_PROJECT`; keep the
   launch-layer variable internal. With decision 5, `SDLC_CWD_DEV` goes; with decision 4 made
   general, `SDLC_LAUNCHER` becomes cli-tool's. Recommendation: yes, in the same cli-tool PR as 5.
7. **The npm-installed sdlc applies no layers.** The publishing plan already exists
   ([D-0014](https://github.com/sksizer/dev/blob/main/docs/planning/decisions/D-0014-cli-primary-npm-distribution.md),
   `solutions/ontological/scripts/build-npm-wrapper.ts`):
   the package npm installs is `@sksizer/sdlc` (D-0014 and the source package.json say `@sdlc/cli`;
   the wrapper publishes `@sksizer/sdlc`), a thin wrapper whose `bin/sdlc.js` is a Node shim (from
   `@osdlc/npm-binary`) that runs a per-platform compiled binary from `@sksizer/sdlc-<os>-<arch>`.
   That binary's entry, `solutions/ontological/scripts/compiled/sdlc-compiled.ts`, skips the hook.
   So under the current plan an installed sdlc ignores `SDLC_HOME`, `dev link` and a project copy,
   which defeats the point of these layers for sdlc. Options:
   - A: give the compiled entry the hook, as `family`'s compiled binary has. The `project` layer
     then finds a project's `node_modules/@sksizer/sdlc` and runs its shim.
   - B: keep the compiled binary fixed, and say so in `--where`; sdlc's layers then work only for
     plugin packs and checkouts.
   Recommendation: A, since every CLI is meant to support both dev testing and a project pin.
8. **Checkout detection and the package for sdlc.** Before sdlc's `project` layer can work:
   - checkout detection must recognise sdlc's checkout inside the monorepo (by a marker file, or by
     `solutions/ontological/package.json` rather than the repo root's);
   - the source `solutions/ontological/package.json` has `"bin": {"sdlc": "plugin/cli/sdlc.js"}`, a
     path that does not exist; the published package's `bin` comes from `build-npm-wrapper.ts`
     instead. Fix or remove the stale entry. sdlc's spec has no `packageName` today; when it gains
     one, it must be the published name (`@sksizer/sdlc`);
   - plugin packs keep `cli/sdlc` and the built `cli/sdlc.js` (which has no `#!` line, so it is run
     as `node cli/sdlc.js`).
9. **sdlc's hand-off cost (0.15 s more).** Options: accept it, or make sdlc's entry choose the copy
   before it loads the rest of sdlc (a small entry module that imports the hook only, then imports
   `main`). Recommendation: try the lazy import; it should bring a hand-off back near 0.25 s.
10. **`process.execve` is experimental in Node.** A failed call also prints Node's own
    `ExperimentalWarning`. If Node removes the API, hand-offs fall back to spawning and the signal
    problem returns. Since [#592](https://github.com/osdlc/osdlc/pull/592), an `execve` that throws
    for a reason other than `ENOENT` or `EACCES` also falls back to a spawn, so a changed API does
    not break hand-offs. Recommendation: accept; watch Node release notes.
11. **Windows signals.** Windows has no `execve`, so a hand-off there still starts a second process,
    and a signal sent only to the outer process can leave the child running. Recommendation: accept
    for now (Ctrl-C reaches both); revisit if a Windows supervisor case appears.

## Suggested order

1. Done: [#592](https://github.com/osdlc/osdlc/pull/592) has decisions 1, 2 and 10, and rewrote
   `launch-order.md`'s section on sdlc as "A tool with its own entry script".
2. A dev PR: move to cli-tool 0.15, delete sdlc's copies of 1 and 2, decide 3, and add 9 (lazy
   import).
3. A cli-tool PR for 4, 5 and 6 once decided.
4. With publishing sdlc: decisions 7 and 8.

## History

- [#569](https://github.com/osdlc/osdlc/pull/569): `--where` in `runMain`.
- [#580](https://github.com/osdlc/osdlc/pull/580): the project layer, quiet on `local`, `execve`
  hand-off, `launch-order.md`.
- [sksizer/dev#3892](https://github.com/sksizer/dev/pull/3892): `family` on `runMain` and devlink.
- [sksizer/dev#3893](https://github.com/sksizer/dev/pull/3893): `sdlc` on `runMain`;
  `sdlc --version` prints `sdlc <version>`.
- [sksizer/dev#3895](https://github.com/sksizer/dev/pull/3895): every dev CLI on cli-tool 0.13;
  version stamps and their guard.
- [sksizer/dev#3901](https://github.com/sksizer/dev/pull/3901): cli-tool 0.14; sdlc's layers
  in-process; `FAMILY_ROOT` for the vault apps.
- [#592](https://github.com/osdlc/osdlc/pull/592): the running bun, the dependency check in the
  hook, the `execve` fallback.
- This item and the sdlc launch guide moved here from sksizer/dev
  ([sksizer/dev#3902](https://github.com/sksizer/dev/pull/3902),
  [sksizer/dev#3903](https://github.com/sksizer/dev/pull/3903)).
