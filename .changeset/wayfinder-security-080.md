---
"@osdlc/wayfinder": minor
---

Safety fixes for running `way` in a repository you do not control.

- `way clean` removes only what it owns. A file store must be a file and a directory store a directory, and no store may be your home directory, a directory above it or a filesystem root. It names the path it refused and exits 1.
- Copy, in the terminal UI and the web view, puts the task's argv on the clipboard quoted for your shell. The web view copied the Command column as it was, so a script named `x; touch PWNED #` pasted as two commands. A command or skill name that holds a control character is not copied at all.
- The web view shows repository text with control characters replaced, as the terminal does, so a bidi override cannot make a row read differently from what runs.
- The web page is served with a strict content security policy: only its own script runs, and it talks only to the server.
- `POST /session` and `/run` read their bodies as a stream and stop at 64 KB.
- A boot token redeemed a second time, such as the old link opened in a second tab, is refused with `401`. `way serve` prints a warning and keeps running; pages already signed in stay signed in. If you did not open the link twice, press Enter for a new one, or stop the server to end every session.
- The browser opener no longer blocks the server, and `way serve` opens a browser on Windows.
- A config file must be a regular file of at most 1 MB.
- Writing a user config that is a symbolic link writes the link's target, so a dotfiles link stays a link.
- While a task runs, `way` ignores `SIGTERM` and `SIGHUP` as well as Ctrl+C and waits for the task, instead of leaving it running with no parent. An argv the system cannot spawn, such as one holding a NUL, is reported instead of crashing.
- On Windows, a user config at `~\.config\wayfinder\config.json`, where 0.7 kept it, is no longer read: 0.8 reads `%APPDATA%\wayfinder\config.json`. Every run warns until you move it. `way clean --legacy` finds the 0.7 Windows stores, and computes every old path the way old releases did, ignoring the `WAYFINDER_*` overrides.
- A `__proto__` key in a config map is ignored with a warning. A leading `~\` is expanded on Windows.

Breaking:

- `way clean --user-config` removes a file `WAYFINDER_CONFIG` names only when its `$schema` names wayfinder's config schema, as every file `way config set` writes does. Add the `$schema` line, or remove the file yourself.
- Over HTTP, a command given a directory positional (`{"dir": ...}`) is refused with `400`. The web view reads the directory `way serve` started in.
- `way run <id>` refuses an id that two tasks share (`ambiguous-task`, `409` over HTTP) and names each task's command line. Run the task by its command line instead.
