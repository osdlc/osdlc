---
id: T-08
type: task
state: open
created: 2026-10-20
---

# T-08: The twins agree on verbatim UNC and device roots

## Goal

Both twins fold a `..` in a `\\?\UNC\` path or a `\\.\` device path against
the same root, the one Windows uses. The twins then give the same answer, as
the [twin rule](../../../../../README.md#library-families) asks.

## Today

- `\\?\UNC\srv\share\x`: Node's `win32.parse` gives the root as
  `\\?\UNC\`, so `foldText` in `resolve.ts` lets a `..` remove `share` and then
  `srv`. The Rust crate reads `\\?\UNC\srv\share\` as the root, so a `..`
  stops at the share. The Rust answer keeps the share boundary. In the cases
  tried, the TypeScript answer is a refusal, so it errs safe, but the twins
  disagree.
- `\\.\C:\..`: both twins keep `C:` as part of the root. Windows may keep only
  `\\.\`. Not checked on Windows.

## Approach

1. Check on Windows where `\\?\UNC\srv\share\..` and `\\.\C:\..` lead.
2. Make the TypeScript root parsing in `split` match, if it differs, and the
   Rust crate too for `\\.\`.
3. Add the cases to the Windows tests of both twins.

## Acceptance criteria

- [ ] The TypeScript fold keeps `\\?\UNC\srv\share\` as the root.
- [ ] Where Windows puts `\\.\C:\..` is known, and both twins follow it.
- [ ] Both twins' Windows tests cover the two cases.
