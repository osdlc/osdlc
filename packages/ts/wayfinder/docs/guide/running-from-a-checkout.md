---
title: Running from a checkout
sidebar:
  order: 9
description: How an installed way runs the checkout you are working on, and how to link one machine-wide.
---

An installed `way` checks which checkout should answer before it runs its
own code. This uses `@osdlc/cli-tool/devlink`.

## Resolution order

First hit wins.

| Layer | Wins when                                            | Off when      |
| ----- | ---------------------------------------------------- | ------------- |
| env   | `WAY_HOME` names a wayfinder checkout                | never         |
| link  | `way dev link` has pointed the machine at a checkout | `way dev off` |
| local | none of the above: the installed package             |               |

`way` never picks a checkout from the current directory. A repository you run
it in cannot choose the code that runs.

A checkout is a directory that holds the wayfinder source (`src/cli.ts`) and a
`package.json` whose `name` is `@osdlc/wayfinder`. The installed package ships
only `dist/`, so it never counts as one. A layer
naming a directory that is no longer a checkout is skipped. The shim prints
which entry it chose on stderr. `WAY_QUIET=1` silences that.

A selected checkout runs from source under Bun, so `way dev` needs
[Bun](https://bun.sh) on `PATH`. Without it, `way` says so and suggests
`way dev off`. Bun runs with `--no-env-file` and an empty config, so it reads
no `.env` or `bunfig.toml`, neither the checkout's nor the directory's you
stand in.

## The verbs

```sh
way dev install            # put a shim for this checkout's launcher on PATH
way dev link               # this checkout answers everywhere (default: the one above the cwd)
way dev link ~/src/other   # or a named one
way dev history            # every checkout ever linked, most recent first
way dev use '#2'           # switch to history entry 2
way dev use canonical      # back to the installed package
way dev status             # which checkout runs now, and why
way dev off                # same as use canonical
```

`install` writes to `${XDG_BIN_HOME:-$HOME/.local/bin}` unless you pass
`--bin-dir DIR`. Every verb takes `--json` and `--dry-run`. `history` marks
the active checkout with `*` and a deleted one as `missing`.

## Where the state lives

In the per-OS config directory for `way`: `~/Library/Application Support/way`
on macOS, `${XDG_CONFIG_HOME:-~/.config}/way` elsewhere. `WAY_ROOT` or
`WAY_CONFIG_DIR` move the base directory. `home` holds the active link.
`history.jsonl` is the record `history` and `use '#n'` read. Both are safe to
delete. Losing them costs the link, not the install.
