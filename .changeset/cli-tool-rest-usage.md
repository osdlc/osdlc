---
"@osdlc/cli-tool": patch
---

A command can name the words it takes after `--` with `rest: { name: 'args' }`. Its usage line then ends in `[-- <args>...]`. Every command still gets those words as `rest`; the declaration only documents them.

`trustCommand` takes `scopeHelp`, the help for `--scope`, so a tool can say which scopes it has.

`config explain` says "no file, environment variable or flag sets it, so the default applies" when only the default sets a key, instead of "default is the highest layer that sets it".
