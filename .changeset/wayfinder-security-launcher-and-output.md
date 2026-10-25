---
'@osdlc/wayfinder': patch
---

Security fixes. Upgrade if you run `way` in repositories you did not write.

- The installed `way` no longer runs code from the directory you stand in. It used to hand off to any directory above the cwd that had a `src/cli.ts`, and ran it under Bun before trust was checked. It now hands off only to the checkout `WAY_HOME` names (an absolute path) or `way dev link` linked, and only when that checkout's `package.json` is named `@osdlc/wayfinder`. `WAY_CWD_DEV` no longer does anything. If you develop wayfinder, run `way dev link` in your checkout once. `way dev` still works but no longer shows in `way --help`.
- The terminal UI, `--list`, `query`, the `trust`, `config` and `providers` listings and every stderr line now replace control characters (C0, DEL and C1) in repository text with U+FFFD. A task name or doc comment could carry escape sequences that write the clipboard or set the window title. `--json` is unchanged and keeps the exact text.
- A relative `XDG_CONFIG_HOME`, `XDG_STATE_HOME` or `XDG_CACHE_HOME` is now ignored, as the XDG spec says. A relative `WAYFINDER_CONFIG` now resolves against the directory you ran `way` in, not the scanned root. Before, a relative value could make a file inside the repository your user config, which can turn execution on and load tools. Use absolute paths, or `~/`.
- A `trust.owners` entry now matches the host as well as the owner. A bare `my-org` means `github.com/my-org` and no longer trusts a clone from `gitlab.com/my-org` or `bitbucket.org/my-org`. To trust an owner on another host, write `gitlab.com/my-org`.
- The `origin` owner lookup runs git with `core.fsmonitor` off.
