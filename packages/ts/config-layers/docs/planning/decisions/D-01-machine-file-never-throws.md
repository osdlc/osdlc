---
id: D-01
type: decision
state: accepted
created: 2026-10-20
---

# D-01: The machine file never throws

## Decision

`machineConfigFile(...).load()` never throws. A missing, unreadable, unparsable
or invalid file gives values, and `loadWithIssues()` reports what was dropped
as `MachineConfigIssue` rows. A file that fails the schema is salvaged: each
unknown key is dropped, each section that is still invalid takes its default,
and the rest is kept. The loader prints nothing. The tool decides how to show
the issues.

Writes are the opposite. `write(text)` throws, and writes nothing, when the
text would add an issue.

## Why

- The machine file is edited by hand and belongs to one person. A typo in it
  must not stop every command of the tool.
- A tool that crashes on its own config cannot help the user fix it. A tool
  that starts, and says what it ignored, can.
- Losing one bad section is better than losing the whole file to defaults.
- Throwing on write keeps the program from saving a file it could not read
  back.

## Consequences

- Every key in the machine schema needs a default, so `schema.parse({})` is the
  all-defaults object.
- A caller that needs to stop on a bad file uses `loadWithIssues()`.
- The Rust twin returns `T::default()` for any problem and offers `read_strict`
  to report it. It does not keep the valid sections.
