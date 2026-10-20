---
id: T-06
type: task
state: open
created: 2026-10-20
---

# T-06: Parity fixture for 0.3.0

## Goal

The shared parity fixture pins the 0.3.0 error kinds that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets. Both
twins run it.

## Today

`packages/rust/path-guard/tests/fixtures/parity.json` has 18 cases with the
error `escapes`. Nine of them are not a proved escape:

| Section           | Cases | 0.3.0 kind       |
| ----------------- | ----- | ---------------- |
| `resolve`         | 2     | `empty_root`     |
| `to_relative`     | 5     | `not_under_root` |
| `resolve_on_disk` | 2     | `unresolvable`   |

No case covers a spent call budget or a relative path where an absolute one
is required.

## Approach

1. Change the `error` string of the nine cases above.
2. Add a case for a spent call budget, with the error `unresolvable`.
3. Add `not_absolute` cases for `is_under`, `absolute` and `real_path`.
4. Add cases for any refusal the owner adds in answer to D-06's open
   questions.
5. Land the fixture change with [T-04](T-04-rust-0-3-0-api.md) and
   [T-05](T-05-ts-0-3-0-api.md), so neither twin's suite fails on main.

## Acceptance criteria

- [ ] The nine cases carry their 0.3.0 kinds.
- [ ] The fixture has a spent-budget case and `not_absolute` cases.
- [ ] `tests/parity.rs` and `tests/parity.test.ts` pass against it.
