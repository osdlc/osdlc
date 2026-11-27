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
