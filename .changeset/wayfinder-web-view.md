---
"@osdlc/wayfinder": minor
---

The web view now runs every action as a command of `way` over HTTP, so the page and the command line read and write the same files with the same rules.

Breaking changes, and what to do:

- The page's own API routes are gone (`/api/catalog`, `/api/trust`, `/api/config`, `/api/run`). The page calls `POST /api/commands/<command>` (`list`, `trust`, `config list`, `config set`, `config unset`), and Run uses `POST /run`.
- The `x-wayfinder-token` header is replaced by `Authorization: Bearer`. The page gets the token by sending the boot token to `POST /session`; it is no longer embedded in the page.
- The theme and a dragged runner order are saved to your user config (`theme`, `runners.order`) instead of the browser. A project's `runners.order` still wins.

Other changes:

- A trust grant from the page asks first: the server answers `428` with a one-time nonce. Writes of `allowExec`, `trust` and `tools` are refused over HTTP and shown read-only in Settings, each with its command.
- Settings shows the effective `allowExec`, and Save names each key and the file it was written to. Theme and `open` are editable there.
- At phone width the toolbar wraps, the filters fold into one **Filters** menu and the tabs scroll on one row.
- A task whose parameters could not be read is marked `?`, and Run asks for optional arguments. `Shift+Enter` runs a task and `?` opens the help, which lists the keys and opens at the top.
- Colors come from `@osdlc/ux`, text is at least 11px, control borders meet 3:1 contrast, and each copy button names what it copies.
- A Skills tab and group list the repository's agent skills. Copy, Enter and Shift+Enter put `/<name>` on the clipboard; nothing runs.
- Each runner's info and its Settings row show its tool's description, language and homepage.
- Settings grants or removes trust for one tool, with the same confirm as a repository grant.
- `way list --json` carries `trustedTools`: the tools trusted on their own.
- Ctrl-C stops `way serve` and any probe it is running. After a run, `way serve` exits with the task's exit code.
