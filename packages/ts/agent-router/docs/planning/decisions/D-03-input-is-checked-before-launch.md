---
id: D-03
type: decision
state: accepted
created: 2026-11-07
---

# D-03: Input is checked before it reaches a launch

## Decision

- A reference's model part, and a pin's model, never start with `-` and hold no whitespace,
  control or invisible formatting character. Anything else is a parse error.
- An effort that is not a known level is an error wherever it appears, wildcards included.
  An effort the catalogue cannot check is reported in the choice's warnings.
- A context size has an upper bound, so every size that parses also prints back to the same
  reference.
- Config records refuse a `__proto__` key instead of dropping it.
- The shipped catalogue snapshot and the built-in tables are frozen, `BUILTIN_QUERY` included.
  `effortsFor` returns a copy, and a query freezes its `chainOrder` and `pins` once. Rows from
  `tool()`, `modelsFor()` and `findModel()` on a query the caller builds are the caller's own
  objects, shared, not copied.

## Why

- The router's output becomes a command line. A model name that starts with `-` would be read
  as a flag by the tool, and an invisible character makes two references look the same while
  they differ. Refusing them here is cheaper than asking every launcher to.
- A typo in an effort is never right, and silently passing it to a tool that declares no
  efforts hides the mistake.
- The built-in tables are shared by every caller in a process. A mutation by one caller would
  change every later answer.
