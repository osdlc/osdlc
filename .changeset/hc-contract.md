---
"@osdlc/host-cleaner": minor
---

**Breaking:** the plugin contract for the first version. Every hook may return a promise and runs under a time limit, a candidate is a path or a ref, and every path candidate is held to its plugin's roots or the targets.

Removed or changed, and what replaces each:

- `survey`, `recheck`, `clean` and the command line's `main` return promises: `await` them. They take a `RunCtx`; `Ctx`, what a hook gets, adds `signal` and `targetsGiven`.
- `PLUGIN_ORDER` and `orderPlugins` are gone: plugins run in the order given, and the shipped ones are `BUILT_IN_PLUGINS`, in run order.
- `--adapter` is gone: use `--plugin`.
- `Candidate` is `PathCandidate` (`path`) or `RefCandidate` (`ref`, optional `at`), so `path` may be unset. A git branch is a ref named by its branch with its repository as `at` (its path was `<repo>:<name>`, which `--spare` still takes), and an Orca record a ref to Orca's id with the gone directory as `at`.
- A plugin without `roots` is held to the targets (it was not checked), so a path candidate outside them is refused `outside-roots`: declare `roots`.
- Plans are at version 2. A plan of another version, or without a field this version needs (`targetsGiven`), is refused: sweep again.
- `ArtifactOptions.command` is gone: `cargoPlugin` and `nodePlugin` take the kit's options (`runner`, `which`) instead. Artifact evidence no longer holds the newest modification time or the size.
- `detect` may answer `{ active, note }` as well as a boolean.
- `host-cleaner status`, `plan` and `clean` refuse to run as root; `config`, which only reads the settings, still answers.

New:

- Each plugin is one `definePlugin` value holding its settings schema (its own refinements kept) and factory.
- Each hook's time limit aborts its own `ctx.signal`. A limit stops a hook that waits; one that works synchronously and answers past its limit is timed out then, and its answer dropped, except `delete`'s, which counts, since it has deleted by then. `cargo` and `node` let their limit fire between checkouts, and `git`, `cargo` and `node` give `discover` 10 minutes.
- A path, whatever the plugin, must sit inside its owner's roots, a target, or a linked worktree of a repository a target is in or whose main checkout is inside a target (so with `~/dev` as the target, a worktree of a repository in `~/dev` is inside wherever it is). `git` declares a worktree whose folder is gone, or left without its `.git`, as a root `{ path, self: true }`, since no checkout is left to find its repository from, so its record can still be pruned. It is checked on real paths at the survey, right before `delete` and in `kit.remove`. A linked worktree whose folder has become a link holds nothing.
- Paths are compared by `realpathSync.native`, so where the filesystem ignores case `~/documents` is `~/Documents`.
- A root may be declared `{ path, self: true }`, so the store folder itself may be a candidate. The core leaves out with a warning a root that is `/`, is or holds the home folder, is a personal folder such as `~/Documents`, is or holds a target or a linked worktree, or is a checkout (and a self root that is a symlink), checked at the survey, right before `delete` and in `kit.remove`.
- A candidate may say what deleting it costs (`costDescription`: `re-download`, `rebuild` or `lost`). `lost` is held and needs `--allow discard-user-data`, and `status` shows the cost.
- Two candidates with the same id or the same real path are one, the first plugin's. A path candidate with others inside it requires them, so they go first, and one that does not run (refused, spared, held or not allowed) keeps the outer one too, which is then blocked with a reason naming that candidate and what would let it run (`--allow <code>`, `--pick <id>` when the plan is made, or that it is refused or spared) in the clean preview, the `clean -i` checklist and the receipt.
- An objection a plan would refuse (an unknown level, a reason that is not a string) refuses its candidate instead, with a warning, so a plan always reads back.
- `create` gets the plugin kit, the safety helpers `cargo` and `node` are now built on (`idle`, `size`, `running`, `onPath`, `candidate`, `run` and `remove`). The core binds it each run to the plugin's roots and the targets, so `kit.remove` takes only the path and an unbound kit removes nothing; a kit the plugin built itself is bound too. `clean` unbinds it when it is over, and given `delete`'s `ctx`, `kit.remove` holds to that call's bounds while another run binds the same plugin. `coveredBy`, `present`, `idleHoursSetting` and `idleHoursOr` are exported beside it.
- Idle time counts in fractions of an hour (`idleHours: 0.5` is half an hour). A folder whose idle time cannot be measured within the time budget is proposed `unmeasured` and needs `--allow unmeasured`. A cargo `target/` is dated within one budget, whatever the number of its profiles.
- `kit.running({ name })` matches the name against the words of each process's command line, so `pnpm` under `node` and the Gradle daemon under `java` are found, while host-cleaner's own process and the launchers above it that name it (the `npm exec` or `pnpm dlx` that started it) are left out. A process table that cannot be read stays unknown for the rest of the hook call.
- git's `delete` refuses a worktree whose folder has become a symlink.
- Right before `delete` the core asks git for the linked worktrees again, so a root that holds one made since the survey is refused then.
- `clean` (the command, also with `--plan`) deletes exactly what its preview showed as `delete`: one shown as `skip` is not deleted when what blocked it clears before the delete. The library's `clean` takes `dropped`, the skips a preview showed, and its receipt lists them ahead of its own.
- `@osdlc/host-cleaner/testing` gives a plugin's tests a fake context, fake programs for the kit, a temporary home and `contractSuite`, which checks a plugin against the contract, a `delete` given its own candidate moved outside behind a symlink included, and which every shipped plugin passes.
- The survey keeps a `detect` note in `notes`; `status`, `plan` and `clean` print it as a warning naming the plugin, and `status` and `clean` carry them under `notes` in `--format json`. The `orca` plugin gives as its note why it runs without asking Orca (it is not running, or its status cannot be read).
- Every hook's `ctx` carries `targetsGiven`, false when the command line fell back to the directory it runs in, kept in the plan.
- The text output writes the home folder in ids as `~`, and `--pick` and `--spare` take that form, also when `HOME` goes through a symlink.
