---
id: T-01
type: task
state: open
created: 2026-10-13
---

# T-01: Windows support

## Goal

The package runs on Windows, with the same contract it has on Linux and
macOS. This comes before `1.0`, if that is feasible
([D-03](../decisions/D-03-platforms-and-runtimes.md)).

## Today

The README states POSIX only. On Windows:

- the shell runners call `sh -c`, and Windows has no `sh`;
- `processGroup` kills with a negative pid, which Windows does not have. The
  async runner falls back to the direct child, and `kill()` on a managed
  process signals nothing;
- npm tools ship as `.cmd` shims, which `spawn` does not find without a shell
  or a lookup.

A missing `sh` or an unresolved shim comes back as `reason: 'spawn'` with an
`ENOENT` error. The group kill fails silently.

## Approach

1. First, guards: on `win32`, the group kill and the shell runners return a result with
   `neverExited: true` and an `error` that names Windows, instead of a silent kill or a bare
   `ENOENT`. Tests cover the guards. The README says Windows support comes before `1.0`, if
   feasible.
2. Then the support itself:
   - the shell runners use `cmd /d /s /c`, with its own quoting rules, or
     require a POSIX shell such as Git Bash;
   - the group kill and `kill()` on a managed process use `taskkill /T /F`;
   - the runners resolve `.cmd` shims;
   - CI gains a `windows-latest` job that runs the whole suite.

## Acceptance criteria

- [ ] On `win32`, the group kill and the shell runners report a clear error;
      none fails silently.
- [ ] Tests cover the guards.
- [ ] The suite passes on `windows-latest` in CI.
- [ ] The README lists Windows as supported.
