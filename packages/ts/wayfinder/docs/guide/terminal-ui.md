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

| Key                     | Action                                                   |
| ----------------------- | -------------------------------------------------------- |
| type                    | narrow the list                                          |
| `Enter`                 | run the selected task, asking for its arguments first    |
| `Ctrl+Y`                | copy the selected task's command line                    |
| `Tab` / `Shift+Tab`     | next / previous runner tab                               |
| `,`                     | settings: runners, discovery, excluded paths and trust   |
| `Ctrl+S`                | trust this repository, after a `y`/`n` question          |
| `Ctrl+R`                | refresh: probe the repository again                      |
| `Ctrl+T`                | only services: tasks that run until you stop them        |
| `Ctrl+E`                | exact search instead of fuzzy                            |
| `Ctrl+D`                | only tasks a file declares, not inferred ones            |
| `Ctrl+O`                | scope: all, the root only, or at most 2 or 3 levels down |
| `↑` / `↓`               | move by one row (`Ctrl+P` / `Ctrl+N` also work)          |
| `Page Up` / `Page Down` | move by a screenful                                      |
| `Home` / `End`          | first / last row (`Ctrl+A` also works)                   |
| `Backspace` / `Ctrl+U`  | delete a character / clear the query                     |
| `?`                     | every key, and what each mark means                      |
| `Esc` / `Ctrl+C`        | quit, stopping any probe that is running                 |

The footer shows as many hints as fit the width, and always `? help` and
`esc quit`. `?` and `way --help --all` print the full list. All three come
from one table in `src/keys.ts`.

## Marks

| Mark      | Means                                                         |
| --------- | ------------------------------------------------------------- |
| `>`       | the selected row                                              |
| `[all 9]` | the selected tab                                              |
| `*`       | a service: it runs until you stop it                          |
| `?`       | parameters unknown; Enter asks for arguments                  |
| `~`       | a tab whose rows came from the store and are out of date      |
| `–`       | a withheld runner, in place of its count                      |

Every mark is text, so the screen reads the same under `NO_COLOR`. Matched
characters are bold and underlined. Colors come from the `@osdlc/ux` tokens,
and yellow is used only for warnings.

## Tabs

`Tab` and `Shift+Tab` cycle through an `all` tab and one tab per runner. Each
tab shows how many tasks it holds. Switching tabs keeps the query. When the
tabs do not fit, the row scrolls to keep the selected tab in view, with `‹`
and `›` where tabs are cut off.

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
a shell. `Ctrl+Y` copies the command instead of running it: the argument vector
quoted for your shell, after a `cd` when the task runs in its own directory.
It uses `pbcopy` on macOS, and `wl-copy`, `xclip` or `xsel` elsewhere. A
clipboard program that hangs is given up on after two seconds.

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

A task whose parameters could not be read, such as a just recipe read
without execution, is marked `?` and asks the same way. The line under it
names the reason. An empty line runs the task as it is. A VS Code task that
uses an editor variable is not run, and the status line says why.

Only the arguments are yours to type. The command is fixed. Quotes group
words the way a shell does, so `"two words"` is one argument, and a backslash
inside single quotes is kept as typed. Nothing else a
shell does happens: no globbing, no variables, no operators. `*.log` reaches
the command as typed.

The tool decides where the arguments go. They are appended for just and pnpm,
and placed after `--` for `npm run`, `cargo run` and moon.

A task with no parameters runs at once.

## Settings

`,` replaces the list with the settings, read the same way as `way config
list`. Each section names the layer that supplied its value.

| Key                | Action                                                     |
| ------------------ | ---------------------------------------------------------- |
| `↑` / `↓`          | move between settings; the screen scrolls                  |
| `Space` / `Enter`  | turn a runner on or off, or change discovery               |
| `[` / `]`          | move a runner earlier / later in the order                 |
| `a`                | add an excluded path                                       |
| `x`                | remove the selected excluded path                          |
| `t` / `u`          | trust the repository or the selected tool (after a `y`/`n` question) / untrust |
| `Esc` / `,`        | back to the list                                           |

Each change is saved at once. Runners, discovery and excluded paths go to
`wayfinder.config.json` in the project, as the [web view](web-view.mdx#settings)
saves them; the runner order goes to the layer that sets it, else your user
config. The list is then probed again. A setting a command-line flag decided,
such as `--exclude`, is saved but keeps the flag's value until `way` starts
again.

Each runner shows `on` or `off`, and why it has no rows when it has none:
withheld, or its tool is not installed. Otherwise it shows its tool's
language, homepage and description. Removing trust with `u` keeps this
run's execution setting; the next `way` withholds what needs trust.

When runners are withheld for want of trust, a TOOL TRUST section lists each
tool they need (`way trust --scope <tool>`), and each tool trusted on its own.
`t` on a tool asks `trust mise here? y/n` and grants that tool only; a runner
runs once it and each tool manager that wraps it are trusted. `u` on a trusted
tool removes its grant, and the list is probed again.

## Skills

When the repository ships agent skills, a `skills` tab follows the runner
tabs, and the `all` tab lists them after the tasks, as `/<name> [hint]`. The
query matches them as it matches tasks; `^t` hides them. A skill runs in an
agent, not here, so Enter and `^y` copy `/<name>` and nothing is spawned. The
`skills` setting chooses which skills are listed.

## Startup and the cache

The first frame comes from the [stored probe](cache.md), so a repository
with a slow runner shows its tasks at once. A real probe runs in the
background and the rows update in place. Nothing is painted from an empty store.

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
line says `2 runners withheld: this repository is not trusted (^s to trust)`.
Under `--no-exec` it says `withheld: --no-exec was given`, and trust is not
offered, since it would change nothing. `Ctrl+S` then asks
`trust this repository? y/n`. Only `y` records a grant. The question exists
because `Ctrl+S` is flow control on many terminals and can arrive by
accident.

A `y` writes the same grant as `way trust`, then re-probes so the withheld
runners appear. When nothing is withheld, `Ctrl+S` says `nothing is withheld` and does
nothing. See [Trust and execution](trust.md).
