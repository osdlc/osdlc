---
'@osdlc/code-host': patch
---

GitHub `updateComment` now tells a deleted comment from other failures through typed-gh's `classifyGhFailure`, instead of its own `(HTTP 404)` match on stderr. A 404 still throws `CommentNotFoundError`. Every other failure throws a `FailureError` carrying typed-gh's kind, such as `rate-limited` or `not-authenticated`.
