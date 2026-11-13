---
id: D-07
type: decision
state: accepted
created: 2026-11-07
---

# D-07: Check folders

## Decision

- `rule-review checks <folder>` runs a folder of check files. A file named
  `<number>-<name>` is a check; the number sets the order, as in `rc.d`.
  Adding a check means adding a file.
- A script check is an executable file whose exit code is its verdict.
- A `.md` file is a prompt check: rules judged by an agent, against the files
  its frontmatter globs match. **Not built yet:** today the folder lists it
  and reports it as skipped. [T-01](../tasks/T-01-prompt-checks.md) builds it
  on the judgement that already exists, by turning each `.md` check into a
  rule source. Until then, rules with their own globs reach an agent through a
  `RuleSourceProvider` (D-04), as sdlc's standards provider does.
- A script declares its scope with `# applies_to:` header lines and runs only
  when the changeset touches it, reading the in-scope files on stdin.
- Every entry that is not a check is listed with the reason, never dropped
  silently.
- Scripts start through `@osdlc/command-seam`, each in its own process group.

## Example

```text
.sdlc/checks.d/
  10-no-conflict-markers   script, every changed file
  20-shell-syntax          script, changed *.sh files only
  30-api-style.md          prompt check: skipped until T-01
  README                   not a check: listed with the reason
```

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

```sh
rule-review checks .sdlc/checks.d --base main   # run what the branch touches
rule-review checks .sdlc/checks.d --staged      # in a pre-commit hook
rule-review checks .sdlc/checks.d --dry-run     # list what would run, and why
```

## Why

- Rules a command can check should be checked by the command: it is exact and
  cheap. A folder keeps those checks beside the rule files, with one scope
  syntax for both.
- A skip without a reason hides a mistake such as a missing executable bit.
- A script that starts other processes would leave them running after a
  timeout or Ctrl-C. Its own process group lets one signal stop them all.

## Consequences

- The folder is the caller's choice; the command has no default folder.
- A check folder runs repository code. A host that runs it for an untrusted
  repository must gate it itself.
