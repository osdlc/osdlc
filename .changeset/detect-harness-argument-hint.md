---
'@osdlc/detect-harness': minor
---

Each skill, command and agent in the report now has `argumentHint`: the `argument-hint` front matter field, such as `[pr-number]`, or `null` when the file sets none. With `mode: 'project'` this lists the skills a repository ships, ready to show as tasks.

An unquoted `argument-hint` is now read as the text the author typed, as Claude Code reads it, in the report and in the `./model` entry point's `argumentHint`. `[message]` used to lose its brackets, and a form that is not valid YAML, such as `[pr-number] [priority]` or `[--fix] <path>`, used to make the whole front matter unreadable, so the skill lost its name and description too. A hint that is not text, such as a block list, is now `null`.

Front matter that is still not valid YAML no longer reads as empty: `name`, `description` and `argument-hint` are taken from their raw lines, and the other keys are dropped.

**Breaking changes**

- `Artifact` has a new required field, `argumentHint`. What to do: a custom provider that builds `Artifact` objects sets `argumentHint` to the hint text, or `null` when there is none.
