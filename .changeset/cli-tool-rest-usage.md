---
'@osdlc/cli-tool': patch
---

A command can name the words it takes after `--` with `rest: { name: 'args' }`. Its usage line then ends in `[-- <args>...]`. Every command still gets those words as `rest`; the declaration only documents them.

`trustCommand` takes `scopeHelp`, the help for `--scope`, so a tool can say which scopes it has.
