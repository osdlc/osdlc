---
"@osdlc/agent-call": minor
---

Add an `agent-call run` command that runs one call from a YAML or JSON spec file: prompt parts from files, text with `{{input}}` placeholders and `--input` values, context files, `--explain` and `--dry-run`, and a `strict` mode that refuses approximated or dropped fields. Paths are confined to `--root`. The library import is unchanged; the package gains a second runtime dependency, `yaml`, loaded only by the command. The spec gains `limits.maxTurns`, a turn limit: native on claude (`--max-turns`) and qwen (`--max-session-turns`), dropped with a note elsewhere. `run.maxTurns` in a spec file maps to it.
