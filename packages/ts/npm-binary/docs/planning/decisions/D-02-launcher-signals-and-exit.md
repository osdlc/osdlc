---
id: D-02
type: decision
state: accepted
created: 2026-11-07
---

# D-02: How the launcher passes signals and the exit status through

## Decision

- The binary runs as a child with inherited stdio.
- SIGTERM and SIGHUP (not on Windows) are always forwarded to the child.
- SIGINT is forwarded only when none of stdin, stdout and stderr is a
  terminal, and never on Windows. Otherwise the launcher ignores it and
  waits for the child.
- The handlers are installed before the child is spawned, so once the
  launcher has found the binary, a signal is never lost and never leaves the
  child running on its own.
- The launcher exits with the child's exit code. When the child dies of a
  signal, the launcher removes its own handler and re-raises that signal on
  itself. If the signal does not end it (Node ignores SIGPIPE, and Windows
  cannot raise one), it exits `128 + signal number`.

## Why

- In a terminal, Ctrl-C goes to the whole foreground process group, child
  included. Forwarding it too delivers it twice, which a CLI that treats a
  second Ctrl-C as "force quit" reads as two presses. Checking all three
  streams covers `echo x | tool`, which still runs in the terminal's
  foreground group.
- Outside a terminal (a supervisor, a CI runner), a SIGINT sent to the
  launcher's pid is the only copy the child would get, so it is forwarded.
- Re-raising makes the parent shell see the same "killed by signal" status it
  would see without the launcher.
- On Windows the child receives the console's Ctrl-C and close events
  itself, and Node's `kill` there is a hard kill, so forwarding would only cut
  the child's cleanup short.
- The child starts running inside `spawn()`. A handler installed after it
  would leave a window in which a signal ends the launcher and orphans the
  child.

## Consequences

- While a standard stream is a terminal, `kill -INT <launcher pid>` does not
  reach the child. Send SIGTERM.
- A run from a terminal with all three streams redirected still gets one
  Ctrl-C twice: the launcher cannot see its process group from Node.
