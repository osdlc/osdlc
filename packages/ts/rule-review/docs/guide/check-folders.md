---
title: Check folders
sidebar:
  order: 5
description: Run a folder of numbered check scripts, each only when the change touches its files. Experimental.
---

Some rules are better checked by a command than by an agent: no merge
conflict markers, shell scripts that parse, a schema that validates. `rule-review checks`
runs a folder of such scripts, each only when the change touches the files it
cares about. This command is experimental: its flags and output may change in
a minor release.

## A check is a numbered, executable file

```text
checks.d/
  10-no-conflict-markers     runs first
  20-shell-syntax            runs second, only when a .sh file changed
  30-review.md               a prompt check: listed, not run yet
  _helpers.sh                skipped: leading '_'
  40-slow.disabled           skipped: disabled
```

The number sets the order (`9-x` runs before `10-x`). The name after it uses
`a-z`, `0-9`, `.`, `_` and `-`. The file must be executable
(`chmod +x`). Anything else in the folder is listed as skipped, with the reason.

## Scope and input

A script says which files it cares about in its leading comments, and reads
the changed files that match on stdin, one per line:

```sh
#!/bin/sh
# applies_to: **/*.sh
# timeout: 60
# Parse each changed shell script without running it.
status=0
while IFS= read -r file; do
  sh -n "$file" || status=1
done
exit $status
```

- No `# applies_to:` line means every file. Several lines add up.
- When no changed file matches, the script does not run and is reported as
  `SKIP - no changed files in scope`.
- `# timeout:` is in seconds; the default is 600. A timeout kills the script
  and everything it started.
- Exit 0 passes. Any other exit fails. A timeout or a signal is an error.

Each script runs from the repository root with these variables:

| Variable | Value |
| --- | --- |
| `CHECK_ROOT` | the repository root |
| `CHECK_NAME` | the name after the number, e.g. `shell-syntax` |
| `CHECK_ORDER` | the number, e.g. `20` |
| `CHECK_DIR` | the check folder |
| `CHECK_BASE` | the commit the changeset was measured from: `HEAD`, or with `--base` the fork point of that rev and `HEAD`, so `git diff "$CHECK_BASE"` shows the same change; empty with `--all` |

## Running it

```text
$ rule-review checks checks.d --base main
PASS  10-no-conflict-markers (13ms)
FAIL  20-shell-syntax - exit 1 (4ms)
        deploy.sh: 3: Syntax error: newline unexpected (expecting ")")

1 passed, 1 failed, 0 errored, 0 skipped
```

Output from a failing check is printed under it. The command exits 1 when any
check fails or errors, 0 otherwise.

| Flag | Changeset |
| --- | --- |
| none | uncommitted work |
| `--staged` | the staged files: use this in a pre-commit hook |
| `--base <rev>` | the files changed since `<rev>` |
| `--all` | every tracked file: run every check over its whole scope |

`--dry-run` lists what would run and what would be skipped. `--json` prints
the results as one document (`kind: "checks"`, or `"checks-plan"` with
`--dry-run`).

Check scripts are code from the repository. Run a folder only from a
repository you trust.
