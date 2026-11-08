---
'@osdlc/cli-tool': minor
---

devlink: a `ToolSpec` can set `onDeadLink: 'newest-surviving'` so that a link naming a deleted checkout runs the newest earlier checkout that still exists, in place of the install. `dev link` and `dev use` then keep a plain-text `candidates` file beside the link (newest first, one path per line, rebuilt from the history, at most 32), and both `resolve()` and the bash launcher from `renderLauncher` walk it. No link (`dev off`) still runs the install, and a suppressor still turns the layer off. The default, `'local'`, keeps today's behaviour, and a launcher rendered without the option is unchanged. New exports: `CANDIDATES_FILE`, `candidatesPath`, `readCandidates` and `writeCandidates`.
