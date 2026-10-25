---
'@osdlc/detect-harness': minor
---

Each skill, command and agent in the report now has `argumentHint`: the `argument-hint` front matter field, such as `[pr-number]`, or `null` when the file sets none. With `mode: 'project'` this lists the skills a repository ships, ready to show as tasks. A custom provider that builds `Artifact` objects must add `argumentHint`.

An unquoted `argument-hint: [message]` is a YAML list. It is now reported as `[message]`, in the report and in the `./model` entry point's `argumentHint`, which used to drop the brackets.
