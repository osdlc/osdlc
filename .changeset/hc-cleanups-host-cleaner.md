---
"@osdlc/host-cleaner": patch
---

Fixes from the review rounds of the host-cleaner pull requests:

- A plugin's `scope` answer that is `/`, is or holds the home folder, is a personal folder, or is not an absolute path without `..` is left out with a warning. Before, it became a target, so any path candidate below it counted as inside the bounds.
- The docker plugin looks at a dangling image once more right before `docker image rm`, and leaves it if it has been tagged since the plan (`image rm` would untag and remove an image with one tag).
- The vscode plugin counts a workspace storage folder as holding chats when the old chat key is only in a `-wal` or `-journal` log beside its `state.vscdb`, not yet written back to the file.
- A descriptor command argument or `env` value with a `..` segment, such as `{path}/../..`, is refused: it named the checked folder as D13 asks, but pointed the command above it.
- agent-history no longer proposes the history of a gone path whose user folder is missing beside your home, such as another machine's `/home/<user>/...`.
- A package plugin whose `exports` target lacks `./` or leaves the package fails to load with "exports no entry for import", as Node refuses it.
- A package plugin whose import does not finish in 30 seconds fails to load instead of hanging the command.
- A package plugin whose settings declare `package` is refused, since the loader keeps that key for the npm name.
- An unusable `--descriptor` file named after a configured package stays a problem even when it sits in the shipped descriptors folder.
- git: `inspect` after a survey no longer lists that survey's gone worktrees as git roots.
- The warning for a bad `detect` answer reads `{ active, note?, vars? }`.
- `kit.running` hides only ancestors that name host-cleaner as a word (a trailing `@version` ignored), so a process whose command line only holds the text, such as a folder named `host-cleaner-notes`, is seen.
- docker: `volume rm` and `image rm` get the delete limit, not the kit's 30 s default.
- ollama: an `OLLAMA_HOST` with a scheme other than http or https is named in detect's note, not reported as a server that does not answer.
- toolchains: a discover stopped while asking rustup what is in use rejects with the hook's abort reason.
- A descriptor glob or project marker longer than 4096 characters is refused before its braces are expanded (`descriptor-1.json` gains `maxLength`).
- A descriptor folder that is a home folder under `/System/Volumes/Data`, `/home<n>` or `/data/home` is refused.
- A descriptor program written with a drive (`C:x`), or as `.` or `..`, is refused as not a name on PATH.
- A descriptor's detect "set one of" problems are listed beside a type error in the same object.
- A combined rest whose matches all go while it is checked again is reported already gone, not failed.
- A descriptor file source's read is stopped at its time limit.
- A skipped variable source says the variable "comes from the config" rather than "is set in the config".
- With XDG_CONFIG_HOME set and no home, `status`, `plan`, `plugins`, `config` and a dry-run `clean` read the config instead of refusing; a deleting `clean` still needs a home.
- The "no home directory" message names USERPROFILE on Windows, and HOME or XDG_CONFIG_HOME with XDG_STATE_HOME elsewhere.
- With no home, `clean -i` refuses before it shows the checklist.
- Shell advice in messages (`--plugin`, `--skip-plugin`, `--descriptor`) quotes a name or path a shell would split.
- `plugins` shows a failed `roots` once, on its row, not again as a warning.
- A descriptor folder or variable written `~\` is read as under home only on Windows, as ignore entries are.
- A descriptor trusts the environment's XDG_* folders only for the home it was created for, not for another `ctx.home`.
- jetbrains is not detected for an empty or relative HOME, and reads XDG_* only when the home is HOME's own.
