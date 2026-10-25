---
'@osdlc/command-seam': minor
---

The runners now start programs on Windows, `.cmd` and `.bat` files included. Node will not spawn a batch file without a shell, so on Windows a runner looks the binary up and, for a `.cmd` or `.bat` file, runs `cmd.exe /d /s /c` with each argument quoted by the C runtime rules and every `cmd.exe` special character escaped with `^`, so `%VAR%` does not expand. Every batch file is escaped twice, since most pass their arguments on with `%*` (npm, pnpm and yarn shims, global ones included, and `gradlew.bat`), and `cmd.exe` starts with `/v:off`, so `!VAR!` never expands, even when the registry turns delayed expansion on. An argument with a line break or a `%` cannot reach a batch file safely (`cmd.exe` expands `%NAME%`, `%NAME:a=b%` and `%NAME:~n,m%` before it reads any `^`), so that run is refused as a failed spawn with an `EINVAL` message. On POSIX nothing changes.

`which` takes a `platform` option. With the Windows rules it splits `PATH` on `;`, applies `PATHEXT` (default `.COM;.EXE;.BAT;.CMD`) in any case, and treats `\` and `/` as path separators. `absolutePathOnly` follows the same option. Tests can run these rules on any OS.

New: `commandString(argv, { platform, shell, cwd })` (experimental) quotes a command line for a person to paste: POSIX shells, PowerShell by default on Windows, or `cmd.exe` with `shell: 'cmd'`. `cwd` adds the change of folder each shell needs.

On Windows, `killTree` runs `taskkill.exe` from `%SystemRoot%\System32` by absolute path, not from the run's `PATH`.
