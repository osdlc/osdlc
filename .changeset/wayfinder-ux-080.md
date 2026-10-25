---
"@osdlc/wayfinder": minor
---

Web view sign-in, CLI text and wording fixes for 0.8.0.

- The web page stays signed in across a reload: it keeps its token in `sessionStorage`, which belongs to one tab and is never sent with a request. A new tab, another browser or a restarted server shows how to get a new link: press Enter in the `way serve` terminal, which opens or prints a fresh sign-in link. The terminal is read only while `way serve` is in the foreground, so `way serve &` keeps serving.
- `way list` and `way query` print each task as Copy puts it on the clipboard: quoted for the shell, with a `cd` for a task that runs from its own directory. Breaking: a script that matched the old `display` text, such as `sh -c bundle exec puma -p $PORT`, now gets `sh -c 'bundle exec puma -p $PORT'`; read `display` from `--json` if you need the old form. `way run` accepts that line as well as an id, its usage shows `[-- <args>...]`, and the run document gains `command`, the line the text form prints.
- Every withheld runner is named on stderr as `way: warning: <runner>: withheld: <cause>`, whatever the cause, with the same label the JSON, terminal UI and web view show. The exec-off label names what turned execution off (`--no-exec was given`, or `allowExec is false in your user config`). Breaking: the `label` of an exec-off unknown in `--json` changed from `withheld: execution is off`. The trust hint follows once, only when a grant would help. Notes about unknown parameters and missing tools are warnings.
- A task that uses an editor variable is labelled `cannot run here: the task uses an editor variable`.
- `way list --json | head` exits quietly instead of printing a stack trace.
- The old `--list`, `--json` and `--serve` flags print a deprecation warning.
- Runner ids give way to group labels (`dependencies`, not `package-manager`) in the terminal UI's row chain, the web search chain, tab info buttons and settings. The Skills tab has its own column headers, status keys and search placeholder, and the terminal UI footer reads `enter copy /name` on a skill row.
- Smaller wording and layout fixes: the bare `way` without a terminal starts its error with `way:`; the terminal UI's `?` screen wraps at narrow widths and its status line keeps a warning in view; the web settings say `Order: alphabetical` and show a tool's language as the terminal UI does; the trust bar has one colon; `way clean` keeps its columns aligned; at phone width the selected tab stays in view and names get more room.
