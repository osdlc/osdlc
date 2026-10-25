---
"@osdlc/wayfinder": minor
---

The terminal UI gets a help screen, editable settings and clearer marks.

New:

- `?` lists every key and what each mark means. The footer fits the width and always keeps `? help` and `esc quit`. `way --help --all` prints the same key list.
- The settings screen (`,`) edits runners (on or off, and their order), discovery and excluded paths, and grants or removes trust. Each change is saved at once and the list is probed again. The screen scrolls. Each runner shows why it has no rows, or its tool's language, homepage and description.
- `^d` keeps declared tasks only and `^o` cycles the scope (all, root, +2, +3), as the web view's Declared and Scope filters do.
- A task whose parameters could not be read is marked `?`, names the reason, and Enter asks for arguments; an empty line runs it as it is. A VS Code task that uses an editor variable is not run, and says why.
- The bare `way` opens the web view when the user config sets `"open": "web"`. `way browse` always opens the terminal UI.
- The status line shows the measured probe time after a probe.
- A `skills` tab lists the repository's agent skills, which the `all` tab shows after the tasks. Enter and `^y` copy `/<name>`; nothing runs.
- The settings screen shows each tool's language, homepage and description, and a TOOL TRUST section that grants or removes trust for one tool (`t`, then `y`; `u`).

Changed:

- The selected tab is marked `[name n]`, a withheld runner's tab shows `–` in place of its count, and the tab row scrolls to keep the selected tab in view. Every mark is text, so the screen reads the same under `NO_COLOR`.
- Colors come from `@osdlc/ux` tokens. `NO_COLOR` turns color off but keeps bold, underline and inverse on a terminal. Matches are bold and underlined; yellow is only for warnings.
- `^y` copies the argument vector quoted for your shell (`commandString` from `@osdlc/command-seam`), not the display text. The copy runs in the background with a two-second limit and tries `wl-copy` under Wayland, then `xclip` and `xsel`.
- Keys typed right after an arrow or another escape sequence are no longer lost, and more Home and End sequences work.
- SIGTERM, SIGHUP and SIGQUIT restore the terminal and exit with 128 + the signal number.
- Argument splitting keeps a backslash inside single quotes, as sh does. Inside double quotes a backslash escapes only `"`, `\`, `$` and a backtick.
- The withheld note reads `2 runners withheld: this repository is not trusted (^s to trust)`, and under `--no-exec` it names the flag and does not offer trust.

Breaking changes, and what to do:

- An argument typed as `'a\b'` now passes `a\b`, not `ab`. Drop the backslash, or move it outside the quotes, if you relied on the old result.
- Copied text quotes each word and no longer contains `<placeholders>`. Add the arguments after pasting.
- A `SIGINT` sent to the terminal UI exits 130, as the CLI does, not 0. Ctrl-C and Esc typed in the UI still exit 0. A script that sends `SIGINT` and checks for 0 must accept 130.
