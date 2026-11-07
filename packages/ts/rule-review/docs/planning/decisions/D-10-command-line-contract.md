---
id: D-10
type: decision
state: accepted
created: 2026-11-07
---

# D-10: The command line follows the osdlc CLI standard

## Decision

- Exit codes, for `rule-review` and `rule-review checks`:

  | Code | Meaning |
  | --- | --- |
  | 0 | Clean, advisory, a dry run, or every check passed |
  | 1 | Findings at or above the floor with `--blocking`, or a check that failed |
  | 2 | The command line cannot run as typed |
  | 10 | The run could not complete: a base that does not resolve, an unreadable pattern, a failing provider, a folder that cannot be read |
  | 11 | With `--strict`, a judgement did not complete |
  | 22 | `git` is not installed |
  | 24 | No repository: the directory is outside git, or does not exist |
  | 130 | Interrupted; the running agents or check were killed |

- `--json` prints one document that starts with `schemaVersion: 1` and
  `kind`: `review` (the run as `reviewChanges` returns it), `checks` (the
  results) or `checks-plan` (a dry run). A failure under `--json`, an
  interruption included, prints the standard error document on stdout instead,
  as well as its line on stderr. The document is written locally, in the shape
  `@osdlc/cli-tool/command` defines, so a run does not load that entry and its
  `zod` peer dependency.
- A dry run exits 0, with or without `--json` and `--strict`.
- Both commands declare their flags with `defineCli` from `@osdlc/cli-tool`,
  so the help is rendered from the same declaration the parser reads.

## Why

- 0.4.0 is the first release, and exit codes and the JSON shape are contract
  (docs/PRINCIPLES.md): changing them later would be a breaking release.
- [`standards/cli-interface.md`](../../../../../../standards/cli-interface.md)
  keeps 2 for a command line that cannot run as typed and gives a tool 10-63
  for its own outcomes. A run that could not complete is not a usage error, and
  it must never be 1, which a CI step reads as "the change breaks a rule". 10
  and 11 keep "could not run" and "ran, but incomplete" apart, so a CI step can
  retry the second.
- 22 and 24 are the codes every osdlc tool gives "not installed" and "no
  repository", so a wrapper that handles them for one tool handles them here.
- 130 is what a shell reports for Ctrl-C. A tool returning it for an
  interruption it caught says the same thing.
- Two hand-written parsers had drifted (one rejected a flag as a value, the
  other did not), and their help was kept by hand beside the flags.

## Not done

- The command does not use the `@osdlc/cli-tool/command` tree, so it has no
  `schema` command and no `help --json`. The tree would also take over
  `--version` and `dev`, which `runMain` handles now. Revisit when a second
  subcommand is added or a caller asks for the schema.
