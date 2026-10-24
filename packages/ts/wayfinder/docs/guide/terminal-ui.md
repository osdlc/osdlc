---
title: The terminal UI
sidebar:
  order: 2
description: Search, keys, tabs, arguments and refresh in the terminal UI.
---

`way` with no flags opens the terminal UI. It shows every task in the
repository in one searchable list. Enter runs the selected task in this
terminal.

The UI has no dependencies: raw mode, ANSI escapes and one frame per
keystroke. Collection is asynchronous, so a refresh runs in the background
while you keep typing.

## Searching

Type to filter. Search is fuzzy by default. Terms are separated by spaces and
ANDed, so `photo dev` narrows the list to a photo app's dev server. A leading
`'` on a term makes that term match as an exact substring. Matching ignores
case.

`Ctrl+E` switches the whole query to exact mode. The current mode is shown at
the top right, next to the tab row. `services` and `exec` appear there too
when they apply.

## Keys

| Key                     | Action                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| type                    | narrow the list                                                    |
| `Enter`                 | run the selected task; a task with parameters asks for them first  |
| `Ctrl+Y`                | copy the selected task's command                                   |
| `Tab` / `Shift+Tab`     | next / previous tab                                                |
| `Ctrl+E`                | toggle exact search                                                |
| `Ctrl+T`                | show only services, tasks that run until you stop them             |
| `Ctrl+S`                | trust this repository, after a `y`/`n` question                    |
| `Ctrl+R`                | refresh: re-probe the repository                                   |
| `,`                     | this project's configuration, read-only                            |
| `↑` / `↓`               | move by one row (`Ctrl+P` / `Ctrl+N` also work)                    |
| `Page Up` / `Page Down` | move by a screenful                                                |
| `Home` / `End`          | first / last row                                                   |
| `Backspace`             | delete the last character of the query                             |
| `Ctrl+U`                | clear the query                                                    |
| `Esc` / `Ctrl+C`        | quit                                                               |

The footer shows the main actions. Movement and line editing are not listed
there, but they work as above.

## Tabs

`Tab` and `Shift+Tab` cycle through an `all` tab and one tab per runner. Each
tab shows how many tasks it holds. Switching tabs keeps the query.

Tabs follow the row groups: Tasks first, then dependencies, tools and git
hooks. A `│` separates one group from the next. The synthesized groups show
their group name as the tab label.

## Services

`Ctrl+T` shows only services: tasks marked persistent, such as a dev server.
Press it again to show everything. A `*` before a row marks a service. To
start an app, press `Ctrl+T`, type its name, then press Enter.

## What Enter runs

The command Enter would run is always on screen above the key line, with any
parameters it takes. Tasks are spawned from an argument vector, never through
a shell. `Ctrl+Y` copies the command instead of running it.

When the task exits, `way` exits with the task's exit code.

## Tasks that take arguments

A recipe like `just deploy <env> [tag]` cannot run as it stands. Its argument
vector is `just deploy`, because the placeholders are not values. Enter on
such a task asks for the arguments first. The key line becomes a command line:

```text
$ just deploy ▮
  takes <env> [tag]    enter run  esc back
```

Type the arguments and press Enter to run. `Esc` goes back with nothing run.
`Backspace` deletes a character and `Ctrl+U` clears what you typed.

Only the arguments are yours to type. The command is fixed. Quotes group
words the way a shell does, so `"two words"` is one argument. Nothing else a
shell does happens: no globbing, no variables, no operators. `*.log` reaches
the command as typed.

The tool decides where the arguments go. They are appended for just and pnpm,
and placed after `--` for `npm run`, `cargo run` and moon.

A task with no parameters runs at once.

## Settings

`,` replaces the list with this project's configuration as wayfinder resolved
it. Each section names the layer that supplied its value. `Esc` goes back.

The terminal view is read-only. Use `way config set` to change a value. The
[web view](web-view.mdx#settings) can edit the same settings.

## Startup and the cache

The first frame comes from the [stored probe](cache.md), so a repository
with a slow runner shows its tasks at once. A real probe runs behind it and
the rows update in place. Nothing is painted from an empty store.

A runner whose stored rows are out of date gets a leading `~` on its tab. The
status line beside the task count then says one of three things:

- **Fresh**: nothing.
- **Stale**: `cached rows — re-probing just (~149ms)` while the probe runs, or
  `cached rows: just 35s old — ^r to re-probe` after it.
- **Stale and slow to probe here**, in red: `cached rows — moon (~2.4s) is
  slow to probe here, so this takes a moment`.

Probe cost is measured in this repository. Where nothing has been measured
yet, the line says `never timed here`.

If a task you run no longer exists, because it was renamed since the stored
probe, the error is followed by a line naming the cached listing and its age.

## Refresh

`Ctrl+R` always runs a real probe and writes the result to the store.
`refreshing` appears beside the task count while it runs. A failed refresh
reports the error there and keeps the list you had.

The selection follows the task, not the row number. A refresh that reorders
rows does not move the cursor to a different task.

## Trust from the keyboard

When runners were withheld because the repository is not trusted, the status
line says `N hidden — repo not trusted (^s to trust)`. `Ctrl+S` then asks
`trust this repository? y/n`. Only `y` records a grant. The question exists
because `Ctrl+S` is flow control on many terminals and can arrive by
accident.

A `y` writes the same grant as `way trust`, then re-probes so the withheld
runners appear. When nothing is withheld for want of trust, `Ctrl+S` says
`nothing is withheld` and does nothing. See [Trust and execution](trust.md).
