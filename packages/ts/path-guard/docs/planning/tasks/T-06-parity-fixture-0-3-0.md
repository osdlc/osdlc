---
id: T-06
type: task
state: open
created: 2026-10-20
---

# T-06: Parity fixture for 0.3.0

## Goal

The shared parity fixture pins the 0.3.0 behaviour that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets. Both
twins run it.

## Today

The fixture is `packages/rust/path-guard/tests/fixtures/parity.json`. Its
sections are `validate_relative`, `resolve`, `contains`, `lexical_absolute`,
`to_relative`, `resolve_on_disk` and `contains_on_disk`. The Rust runner is
`packages/rust/path-guard/tests/parity.rs`. The TS runner is
`packages/ts/path-guard/tests/parity.test.ts`. Each reads the sections by name.

14 cases change their result in 0.3.0:

| Section           | Case                                          | 0.2 result       | 0.3.0 result     |
| ----------------- | --------------------------------------------- | ---------------- | ---------------- |
| `resolve`         | an empty root contains nothing                | `escapes`        | `empty_root`     |
| `resolve`         | a root that folds to nothing contains nothing | `escapes`        | `not_absolute`   |
| `contains`        | an empty outer holds no absolute path         | false            | `empty_root`     |
| `contains`        | an empty outer holds no relative path         | false            | `empty_root`     |
| `contains`        | an outer that folds to nothing holds nothing  | false            | `not_absolute`   |
| `to_relative`     | outside the root                              | `escapes`        | `not_under_root` |
| `to_relative`     | a name prefix is not under the root           | `escapes`        | `not_under_root` |
| `to_relative`     | the parent of the root                        | `escapes`        | `not_under_root` |
| `to_relative`     | the filesystem root                           | `escapes`        | `not_under_root` |
| `to_relative`     | a relative path is not under an absolute root | `escapes`        | `not_absolute`   |
| `to_relative`     | a relative root and path                      | ok               | `not_absolute`   |
| `to_relative`     | an empty root with an absolute path           | `parent_segment` | `empty_root`     |
| `resolve_on_disk` | a link loop                                   | `escapes`        | `unresolvable`   |
| `resolve_on_disk` | a link to itself                              | `escapes`        | `unresolvable`   |

No case covers a spent call budget. The fixture has no `is_under` or
`real_path` section, and the Rust crate has no `is_under`.

## Approach

1. Change the 14 cases above.
2. Let a `contains` case expect an error as well as a boolean. Teach both
   runners to read it.
3. Rename `lexical_absolute` to `absolute` and give each case a `cwd`. Add
   cases for a relative path joined onto `cwd`, and for a relative `cwd`,
   which is `not_absolute`.
4. Add an `is_under` section. Move the cases from
   `packages/ts/path-guard/tests/lexical-entry.test.ts` into it, and add
   `not_absolute` and `empty_root` cases.
5. Add a `real_path` section with on-disk cases: a missing path, a link, a
   walk that gives up (the answer folds `..` as text), and a relative path
   (`not_absolute`).
6. Add a `resolve_on_disk` case for a spent call budget, with the result
   `unresolvable`.
7. Add cases for any refusal the owner adds in answer to D-06's open
   questions.
8. Update both runners for the new and renamed sections in the same PR.
9. Land the fixture change with [T-04](T-04-rust-0-3-0-api.md) and
   [T-05](T-05-ts-0-3-0-api.md), so neither twin's suite fails on main.

## Acceptance criteria

- [ ] The 14 cases carry their 0.3.0 results.
- [ ] The fixture has `absolute`, `is_under` and `real_path` sections, and a
      spent-budget case.
- [ ] `tests/parity.rs` and `tests/parity.test.ts` read every section and
      pass against it.
