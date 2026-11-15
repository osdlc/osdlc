---
title: Writing rule files
sidebar:
  order: 2
description: Which rule file governs which file, and how to write rules a reviewer can check.
---

## Which rule file covers which file

A `CLAUDE.md` or `AGENTS.md` governs the directory it sits in and everything
below it. That includes dot paths: a root rule file covers `.github/` too.

```text
CLAUDE.md                 governs everything
src/
  api/
    AGENTS.md             governs src/api/**
    users.ts
  math.ts
docs/
  CLAUDE.md               governs docs/**
  guide.md
```

| Changed file | Judged against |
| --- | --- |
| `src/math.ts` | `CLAUDE.md` |
| `src/api/users.ts` | `CLAUDE.md`, then `src/api/AGENTS.md` |
| `docs/guide.md` | `CLAUDE.md`, then `docs/CLAUDE.md` |

Each rule file is a separate judgement, with only its own rules and its own
files. A file under three nested rule files is judged three times, by three
different rule sets. The rules are not merged: a nested file adds rules, it
does not override the ones above it.

If a directory has both `CLAUDE.md` and `AGENTS.md` with the same rules (one
is a symlink to the other, or one just says `@AGENTS.md`), it is judged once.

## Imports

A rule file can pull in another file with `@path`, the way Claude Code reads
it:

```markdown
# API rules

See @../../docs/api-conventions.md for the full list.
```

The imported text is inlined, marked with where it came from. Imports are
followed two levels deep, and only to files inside the repository. A
`[[wikilink]]` is not an import.

## Rules a reviewer can check

The agent is told to treat the rule file as the only rules, to report only
what it can quote from the diff, and that an empty answer is the expected one
for a clean change. It works best with rules that have a fact for an answer.

| Works well | Works badly |
| --- | --- |
| "Never use the `any` type; use `unknown` and narrow it." | "Write clean code." |
| "Every HTTP handler validates its input with zod before using it." | "Be careful with user input." |
| "Shell commands go through `run()` in `lib/exec.ts`." | "Prefer good abstractions." |
| "Public functions in `src/` have a doc comment." | "Keep functions small." |

A rule that two careful reviewers would disagree about gives findings that
come and go between runs. And if a tool can check a rule (a linter, the type
checker, a test), let the tool check it: that is exact and free. For such
rules, see [check folders](check-folders.md).

Rule files that only point elsewhere ("See README.md") are fine: imports are
inlined, and a file with no text of its own is skipped.

## Severity

The agent grades each finding:

| Severity | Meaning | Example |
| --- | --- | --- |
| `violation` | The change contradicts a rule. | A new `any` where the rules forbid it. |
| `tension` | Defensible, but pulls against a rule's intent. | A validated handler that skips validation for one field. |
| `drift` | Complies today, but moves away from a rule. | A helper that makes the forbidden pattern easier next time. |

`--blocking` fails on `violation` by default. `--severity tension` fails on
tension too; `--severity drift` on all three.

## Large changes

A judge given sixty files reasons worse about each one than a judge given a
dozen. When a rule file governs more than 12 changed files, its files are
split into even shards, each judged separately against the same rules and run
at the same time. Findings still name the rule file, not the shard. Change the
limit with `--max-files`, or turn it off with `--max-files 0`.

`--exclude` drops files from the review entirely, for example generated code:

```sh
rule-review --base main --exclude 'dist/**' --exclude '**/*.generated.ts'
```
