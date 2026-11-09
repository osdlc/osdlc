---
id: T-02
type: task
state: open
created: 2026-11-07
---

# T-02: Per-device tokens that can be revoked

## Goal

One shared token per grant cannot be withdrawn from one device without
breaking every other device's link. Each device should get its own token,
with a label, created and last-seen times, and a way to revoke it.

## Proposed

- Pair a device by handing it a fresh token, stored hashed at rest with its
  label and grant.
- `Tokens::with_label` already carries a label and is experimental
  ([D-02](../decisions/D-02-version-line-and-stability.md)); this task decides
  its final shape and records it in a decision.
- Revoking a token removes it from the running guard without a restart.

## Done when

- A revoked device's next request gets 401 while other devices keep working,
  in a test.
- Token files hold hashes, not tokens.
