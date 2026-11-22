---
id: D-05
type: decision
state: accepted
created: 2026-11-22
---

# D-05: Which Obsidian Bases behaviour the package follows

## Decision

The package follows the Bases syntax as the
[official help](https://help.obsidian.md/bases/syntax) documents it for Obsidian 1.9 to 1.13, and
the typings of the Obsidian API for the `.base` schema. Where the documentation is silent, it
chooses the behaviour that matches Obsidian's per-cell error model: a failure shows in the cell and
the query completes.

## Where it differs from Obsidian, on purpose

| Area                  | Behaviour here                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugins               | No plugin-registered expression functions. A plugin view type is read and kept, and `runView` runs it like any other view. |
| Rendering             | None. The package returns rows, groups and summaries.                                                                                         |
| Backlinks             | `file.backlinks` is what the vault index holds. The index is a snapshot, so a new link needs a new index.                                      |
| Lenient input         | A bare list of filters is read as `and`. A sort key may be `"prop"` or `"-prop"`, or use the legacy `column:` spelling.                       |
| Numbers               | `number()` and the numeric summaries skip a blank or non-numeric cell. A blank string is not 0.                                               |
| Empty and filled      | The Empty and Filled summaries use `isEmpty()`: an empty string, list or object is empty.                                                     |
| Dates                 | A date-only value plus an hour, minute or second duration stays date-only only while the result is at local midnight. Calendar days and months keep it date-only. |
| Unknown keys          | Unknown top-level and view keys are kept in `extra`, so a base round-trips through the parser.                                                |

## Why

- A documented target is testable. Observing each Obsidian release would need the app, which this
  package never runs.
- Behaviour that Obsidian changes after 1.13 is not followed. [T-03](../tasks/T-03-newer-bases-behaviour.md)
  tracks it.
- The lenient inputs cost nothing for a file Obsidian wrote, and they let hand-written bases parse.
