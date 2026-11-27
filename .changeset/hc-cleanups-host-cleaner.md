---
"@osdlc/host-cleaner": patch
---

Fixes from the review rounds of the host-cleaner pull requests:

- A plugin's `scope` answer that is `/`, is or holds the home folder, is a personal folder, or is not an absolute path without `..` is left out with a warning. Before, it became a target, so any path candidate below it counted as inside the bounds.
- The docker plugin looks at a dangling image once more right before `docker image rm`, and leaves it if it has been tagged since the plan (`image rm` would untag and remove an image with one tag).
- The vscode plugin counts a workspace storage folder as holding chats when the old chat key is only in a `-wal` or `-journal` log beside its `state.vscdb`, not yet written back to the file.
