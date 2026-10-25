# Open SDLC standards

Status: draft.

These standards describe defaults that fit almost any software project: what
the common tasks are called, what each one may do, and where a project writes
down how it is built, tested and shipped. They are written for people, for
tools and for coding agents. A project that follows them can be picked up by
any of the three without being read first.

The standards are delivered three ways:

- **Conventions.** The documents in this folder. Each one states a rule, why
  it holds, and how to apply it.
- **`sdlc.yaml`.** The file where a project records the facts the
  conventions ask for, in a form a tool can read.
- **Libraries and tools.** The `@osdlc` packages and the `sdlc` CLI read
  `sdlc.yaml`, detect sensible defaults when it is missing, and check that a
  project follows the conventions.

## Principles

1. **Defaults first.** A project with no `sdlc.yaml` still gets the standard
   verbs, detected from its manifests. The file records only what differs
   from the defaults.
2. **Name the task, not the tool.** `lint` means the same thing in every
   project. Which linter runs is the project's choice.
3. **The native tool owns the command.** `sdlc.yaml` maps a standard name to
   the command the project already has (`npm run lint`, `cargo clippy`,
   `just lint`). It does not restate tools, flags or config paths.
4. **Reading is safe.** A task whose name has no suffix does not change
   tracked files. The few that do are named for it.
5. **One place for each fact.** Aggregates such as `check` list other tasks by
   name. They do not copy commands.
6. **Language-neutral.** Rust, TypeScript, Python and Go projects answer to
   the same names.

## Standards

| Standard | Covers |
|---|---|
| [verbs.md](./verbs.md) | The standard task names, what each may do, and the default command per ecosystem |
| [sdlc-yaml.md](./sdlc-yaml.md) | `sdlc.yaml` as a structured README: which questions it answers and where |
| [doc-locations.md](./doc-locations.md) | Where each kind of document lives: root files, the `docs/` tree, decision records |
| [review.md](./review.md) | How changes are reviewed: risk tiers, review layers, findings, responses, merging |
| [cli-interface.md](./cli-interface.md) | What every command line provides: progressive help, `--json` documents, `schema`, `--version`, exit codes, streams, color |

## Where these come from

The verb rules generalize `S-0013-baseline-task-vocabulary` from the
development repository, with its monorepo details (moon, Tauri, file counts)
removed. The review standard builds on that repository's
`S-0017-code-review-rubric` and `S-0018-review-response-policy`. The
`sdlc.yaml` schema itself is documented in the `sdlc` plugin at
`conventions/sdlc-yaml.md`. These standards say what the file should hold.
That document says how the current CLI reads it.
