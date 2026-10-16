---
id: D-13
type: decision
state: accepted
created: 2026-10-13
---

# D-13: Docs and community files

## Decision

In the package:

- The README is the only user documentation for now. A docs site may come
  later.
- Security reports go through GitHub private vulnerability reporting. The
  project aims to reply within a week.
- CONTRIBUTING shows each script with `pnpm`, and says that `npm run` and
  `bun run` work the same way. It asks for Bun only to run the tests, until
  [T-02](../tasks/T-02-vitest.md).
- Any claim about another library is checked against that library before it
  goes in the README or a docs site.
- `SECURITY.md` and `CONTRIBUTING.md` ship in the npm tarball, next to the
  README, CHANGELOG and LICENSE.
- The CHANGELOG's first version entry, `0.3.0`, lists what the package does
  and the behaviour notes a user needs. Each later entry lists what changed.
- The LICENSE and the `author` field name SK Sizer.

## Why

- A docs site takes time to build and keep current while the API can still
  change in `0.x`.
- Readers who open the package in `node_modules` or the npm file list should
  find how to report a problem and how to build it.
- Earlier versions were never published, so a long list of fixes to code no
  one had would only confuse.

## Consequences

- The README links use full URLs, because the README is also the npm page.
