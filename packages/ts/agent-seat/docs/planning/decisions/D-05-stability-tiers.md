---
id: D-05
type: decision
state: accepted
created: 2026-11-07
---

# D-05: Stability tiers for the first release

## Decision

- The package is 0.x: a minor release may change any item.
- These are also `@experimental`, listed in the README and checked by a test:
  - the `vscode` and `jetbrains` hosts and their companion plumbing, until the companions are
    published;
  - the tmux attach helpers (`tmuxSessionName`, `tmuxIdSessionName`, `tmuxAttachArgv`,
    `tmuxSwitchClientArgv`, `insideTmux`), until an `attach` part replaces them;
  - `hostCanWait`, until waiting is a declaration on the host.
- `HostName` stays a closed set of the nine built-in hosts in 0.x. A caller can still pass its own
  `Host` object wherever a host is taken; only `HostRegistry` and `HostNameSchema` are keyed by
  the closed set.

## Why

- An item a consumer cannot use (a host whose companion is not published) or that is waiting for
  its replacement should not look stable.
- Opening `HostName` changes every `Record<HostName, Host>` and schema in consumers. No consumer
  needs a host of its own yet, so it waits for one.
