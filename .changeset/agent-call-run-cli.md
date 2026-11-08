---
'@osdlc/agent-call': minor
---

Add an `agent-call run` command that runs one call from a YAML or JSON spec file: prompt parts from files, text with `{{input}}` placeholders and `--input` values, context files, `--explain` and `--dry-run`, and a `strict` mode that refuses approximated or dropped fields. Paths are confined to `--root`. The library import is unchanged; the package gains a second runtime dependency, `yaml`, loaded only by the command.
