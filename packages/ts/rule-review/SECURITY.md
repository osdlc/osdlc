# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release.

## What this package runs

- `rule-review checks <dir>` runs the executable scripts it finds in the
  folder you name. A file without the executable bit is listed as skipped. Run
  it only on folders you trust, as you would run any script from that folder.
- A judgement (`rule-review`, `reviewChanges` and `review`) sends the diff and
  the text of the matching rule files to the agent CLI you chose, and through
  it to that agent's model provider. Do not run it on a change you may not
  send there. The agent runs read-only, with no session saved.
- The judge reads the change and the rule files, and either can try to steer
  it: a comment in a diff can ask the agent to report nothing, or to read other
  files. Read-only still lets the agent read any file in the checkout (its
  working directory is the project root), and some engines can also fetch URLs
  in read-only mode (agent-call maps opencode's to `webfetch: allow`). In CI
  that process holds the model API key. Findings are
  evidence for a reviewer, not a security control. Do not rely on
  `--blocking` to keep hostile changes out of a pull request from an untrusted
  author.
- Rule files and their `@path` imports are read only from inside the
  repository, symlinks included.

## What to expect

This is a small project. We aim to reply within a week, tell you whether we
accept the report, and credit you in the release notes if you want that.
