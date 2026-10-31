---
'@osdlc/wayfinder': patch
'@osdlc/pr-update': patch
'@osdlc/repo-cleaner': patch
---

In a project that has this tool in its `node_modules`, the global command now runs the project's copy, unless a `dev link` or `<NAME>_HOME` checkout is set. Set `<NAME>_PROJECT=0` to keep the global copy.
