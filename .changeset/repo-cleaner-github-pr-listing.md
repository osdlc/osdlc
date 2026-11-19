---
'@osdlc/repo-cleaner': patch
---

The GitHub provider lists the swept remote's own repository (`gh pr list --repo <host>/<project>`) instead of the one `gh` prefers, so a fork's branches are no longer judged against the upstream's PRs. It reads every open PR (up to 1000) apart from the newest 300 of any state, and both providers now report a listing that stopped short, or one for a fork whose PRs to its parent were not checked, as incomplete: the sweep adds a note and a remote branch with no known PR needs `confirm-open-pr`.
