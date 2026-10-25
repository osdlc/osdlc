---
'@osdlc/typed-git': minor
---

Behaviour change: `mainCheckout()` now answers null for a bare store with no main checkout, instead of the store's parent folder. When the common dir is not `<checkout>/.git` (a submodule, a `--separate-git-dir` clone), it reads `core.worktree`, this checkout when the cwd is the main worktree, or the first non-bare `worktree list` entry.
`branches()` lists `refs/heads/` names, so a branch that shares its name with a tag is no longer reported as `heads/<name>`. `statusEntries()` skips the source field of a rename or copy in the worktree column too, so the entry after it is no longer misread. `parseRepoRef` reads a GitLab page in a nested group (`…/group/sub/repo/-/…`) as the whole project path, and still reads a GitHub page whose path holds a `-` segment. `parseRemoteUrl` answers null for a `file://` URL and strips `.git` from `repo.git/`. `scanForCheckouts` on a folder that is itself a checkout answers that folder alone.
