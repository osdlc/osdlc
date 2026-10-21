---
id: D-03
type: decision
state: accepted
created: 2026-10-20
---

# D-03: No config search

## Decision

The package does not search for a config file. The tool passes the project
root, the file name and the variable that relocates the file to
`resolveConfigFile(projectRoot, { name, envVar })`. The local overlay is the
file beside it, `<stem>.local.<ext>`. The machine file is in the tool's config
home, named by `tool` and `vendorDirs`.

## Why

- A search over several names and folders makes it hard to say which file a
  value came from. Here a value comes from one of three known files.
- The tool already knows its project root. Walking up the tree guesses it.
- One name per tool, with one variable to move it, is enough for tests and
  one-off runs.

## Consequences

- There is no `findUp`. The Rust crate has one (`find_up`); the difference is
  in the README's table.
- A tool that wants a search finds the root itself and passes it in.
- `cosmiconfig`, `c12` and `rc` are the choice when a search is wanted. The
  README says so.
