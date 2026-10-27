---
'@osdlc/pr-update': minor
'@osdlc/repo-cleaner': minor
---

`pr-update dev` and `repo-cleaner dev` run the tool from a development checkout: `dev link <checkout>` makes the installed command run that checkout's source under Bun, `dev status` says which code runs, and `dev off` goes back. `PR_UPDATE_HOME` and `REPO_CLEANER_HOME` do the same for one run. `dev` is now a word for both tools: sweep a directory named `dev` with `repo-cleaner ./dev`, as with `apply`. The bin now loads `dist/bin.js`, built from the new `src/bin.ts`.
