---
"@osdlc/host-cleaner": patch
---

Fixes from the review rounds of the host-cleaner pull requests:

- A plugin's `scope` answer that is `/`, is or holds the home folder, is a personal folder, or is not an absolute path without `..` is left out with a warning. Before, it became a target, so any path candidate below it counted as inside the bounds.
