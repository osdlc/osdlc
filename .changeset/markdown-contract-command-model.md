---
'@osdlc/markdown-contract': minor
---

The `markdown-contract` CLI is built on `@osdlc/cli-tool`'s command model instead of dispatching `argv[0]` by hand. Command output and `runCli` are unchanged, and so are exit codes, except for two command lines that used to work and now exit 2:

- `--version` after a command name: `markdown-contract validate --version` printed the version and exited 0; it now fails with `unknown option '--version'`. Use `markdown-contract --version`.
- A flag and its value before the command name: `markdown-contract --format json validate docs` ran `validate`; it now fails with `unknown command 'json'`, because the first word that is not a flag is read as the command. Put flags after the command name (`markdown-contract validate --format json docs`).

Usage errors no longer print the full usage text. A flag from another command now fails with the parser's `unknown option '--x'` and an unknown command with `unknown command 'x'`, and `--help` is generated per command (`markdown-contract validate --help`). New: `help` and `schema` commands.
