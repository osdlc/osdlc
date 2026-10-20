---
id: D-02
type: decision
state: accepted
created: 2026-10-19
---

# D-02: Read-only, with no program run unless asked

## Decision

- The package never writes. It does not create, change or delete a harness's
  files or any other file.
- It runs no program by default. `detect()` finds a harness's binary by
  walking `PATH` and checking the file, with no subprocess.
- `detect({ allowExec: true })` runs `<binary> --version` for each harness it
  found, for at most three seconds each, to fill `install.version`. The
  program runs through `@osdlc/command-seam`. A provider of kind `exec` is
  skipped without `allowExec`, and the report says so in `diagnostics`.
- Hook commands in a harness's settings are returned as data. They are never
  run.
- `detect({ mode: 'project' })` reads inside the project root only. It reads
  no home folder or system folder, does not probe for the binary and gives no
  sign-in evidence. A read outside the root, also through a symbolic link,
  answers "absent".

## Why

- A caller may run this in an editor, a CI job or an agent. It must be safe to
  call on any machine without side effects.
- Running a program found on `PATH` is code execution. It should be a choice
  the caller makes.
- Project mode lets a tool inspect an untrusted checkout without touching the
  user's own configuration.

## Consequences

- `install.version` is `null` until the caller opts in.
- A caller that needs to change a harness's configuration does it with its
  own code. The package gives it the facts to do that.
- Adding a read that has a side effect, such as a keychain lookup, needs a new
  decision.
