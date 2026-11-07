---
id: D-07
type: decision
state: accepted
created: 2026-11-07
---

# D-07: Check folders

## Decision

- `rule-review checks <dir>` runs a folder of check files. A file named
  `<number>-<name>` is a check; the number sets the order, as in `rc.d`.
  Adding a check means adding a file.
- A script check is an executable file whose exit code is its verdict. A
  `.md` file is a prompt check, judged by an agent like a rule file
  ([T-01](../tasks/T-01-prompt-checks.md); reported as skipped until then).
- A script declares its scope with `# applies_to:` header lines and runs only
  when the changeset touches it, reading the in-scope files on stdin.
- Every entry that is not a check is listed with the reason, never dropped
  silently.
- Scripts start through `@osdlc/command-seam`, each in its own process group.

## Why

- Rules a command can check should be checked by the command: it is exact and
  cheap. A folder keeps those checks beside the rule files, with one scope
  syntax for both.
- A skip without a reason hides a mistake such as a missing executable bit.

## Consequences

- The folder is the caller's choice; the command has no default folder.
- A check folder runs repository code. A host that runs it for an untrusted
  repository must gate it itself.
