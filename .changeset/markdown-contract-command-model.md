---
'@osdlc/markdown-contract': minor
---

The `markdown-contract` CLI is built on `@osdlc/cli-tool`'s command model instead of dispatching `argv[0]` by hand. Exit codes, command output and `runCli` are unchanged. Usage errors no longer print the full usage text. A flag from another command now fails with the parser's `unknown option '--x'` and an unknown command with `unknown command 'x'`, and `--help` is generated per command (`markdown-contract validate --help`). New: `help` and `schema` commands.
