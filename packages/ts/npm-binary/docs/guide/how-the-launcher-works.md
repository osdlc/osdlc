---
title: How the launcher works
sidebar:
  order: 2
description: What the generated launcher does on a user's machine, step by step, and why.
---

`renderLauncher` returns the source of a small Node script. It becomes the
`bin` of your launcher package, so it is what runs when a user types
`mytool`. It does four things: pick the platform, find the binary, run it, and
hand back its result. It is plain CommonJS with no dependencies, so it works on
any Node 18 or later, whatever module settings the user's project has.

## 1. Pick the platform

The script carries a table from platform key to package and binary path,
written in when you render it:

```js
const PLATFORM_PACKAGES = JSON.parse("{\"darwin-arm64\":{\"package\":\"@mytool/cli-darwin-arm64\",\"binary\":\"bin/mytool\"}, ...}")
const BINARY = "mytool"
const LAUNCHER = "mytool"
const DEBUG_ENV = "MYTOOL_DEBUG"
```

It looks up `` `${process.platform}-${process.arch}` ``, for example
`linux-x64`. If the key is not in the table, it stops:

```text
mytool has no build for freebsd-x64. Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.
```

Every value is written as a JSON string literal, so a name that contains a
quote or a backslash comes through unchanged.

## 2. Find the binary

It resolves `@mytool/cli-linux-x64/package.json` from where the launcher is
installed, and takes the binary path relative to it. Going through
`package.json` means an `exports` map in the platform package can never block
the lookup.

Two things can go wrong, and each has its own message:

```text
mytool: the platform package @mytool/cli-linux-x64 is not installed. It is an optional
dependency of mytool, so it is skipped when optional dependencies are turned off
(--omit=optional, --no-optional) or when the lockfile was made on another platform.
Reinstall without those, or add @mytool/cli-linux-x64 directly.
```

```text
mytool: @mytool/cli-linux-x64 is installed but its binary .../bin/mytool is missing; try reinstalling.
```

[Troubleshooting](troubleshooting.md) covers the causes.

Set the variable you passed as `debugEnv` to see what it picked:

```sh
$ MYTOOL_DEBUG=1 mytool --version
mytool launcher: platform=linux-x64 package=@mytool/cli-linux-x64 binary=/home/me/proj/node_modules/@mytool/cli-linux-x64/bin/mytool
mytool 1.2.0
```

## 3. Run it

The binary runs as a child process with the launcher's arguments and
**inherited stdio**: it reads the same stdin and writes straight to the same
terminal. Colours, prompts and progress bars work as if the user had run the
binary directly.

### Signals

A user can stop the tool with Ctrl-C, a process manager can send SIGTERM, and
closing a terminal sends SIGHUP. The launcher sits between them and the
binary, so it decides what to pass on:

| Signal  | Forwarded to the binary?                                       |
| ------- | -------------------------------------------------------------- |
| SIGTERM | Always.                                                        |
| SIGHUP  | Always (not on Windows, which has no SIGHUP).                  |
| SIGINT  | Only when none of stdin, stdout and stderr is a terminal.      |

Why SIGINT is special: when you press Ctrl-C in a terminal, the terminal sends
SIGINT to every process in the foreground job, the launcher and the binary
both. If the launcher forwarded its copy as well, the binary would get two.
Many CLIs treat a second Ctrl-C as "stop now, skip cleanup", so a single press
would look like two.

```text
Ctrl-C in a terminal
  ├─▶ launcher   (ignores it, keeps waiting)
  └─▶ binary     (gets exactly one SIGINT)
```

When no standard stream is a terminal, for example under a supervisor or in CI,
nobody else delivers SIGINT to the binary, so the launcher forwards it.

Two edge cases follow from this:

- While a standard stream is a terminal, `kill -INT <launcher pid>` reaches
  the launcher but not the binary. Send SIGTERM to stop it from a script.
- If you run it from a terminal with all three streams redirected
  (`mytool < in > out 2> err`), the launcher cannot tell it is still in the
  terminal's foreground job, so Ctrl-C reaches the binary twice.

## 4. Hand back the result

When the binary exits, the launcher exits with the same code. `mytool; echo $?`
prints what the binary returned.

When the binary is killed by a signal, the launcher removes its own handler
and sends itself the same signal, so the shell sees "killed by SIGTERM", just
as it would without the launcher. If that does not end it (Node ignores
SIGPIPE, and Windows cannot raise signals this way), it exits with
`128 + signal number`, the shell's convention: 143 for SIGTERM, 141 for
SIGPIPE.

If the binary cannot be started at all (a permission problem, a binary for the
wrong CPU), the launcher prints the reason and exits 1:

```text
mytool: could not run /.../bin/mytool: spawn /.../bin/mytool EACCES
```
