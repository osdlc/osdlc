---
'@osdlc/observe': patch
---

Two new entry points.

- `@osdlc/observe/redact`: an always-on secret redactor for text and JSON, and the JSONL writer with it in front. `createRedactor` returns a `Redactor` whose `redact` and `redactJson` replace each secret with `[REDACTED:<rule>]` and return per-rule counts, never the matched text. It runs secretlint's recommended preset, built-in rules for headers, assignments, JWTs, provider keys, URL passwords and PEM keys, and the values of secret-named environment variables. Options add rules (`envNames`, `extraPatterns`) and never remove them. It fails closed: a pass that throws replaces the whole value. A `secretlint-disable` comment in the text does not switch any rule off. `redactJson` drops functions (an own `toJSON` included), so nothing runs when the line is written, and keeps apart two keys that redact to the same text. `redact` returns `Redacted`, a branded string, so a field typed `Redacted` refuses a plain string at compile time. `appendRedactedJsonl` redacts every field of a line but the envelope's own and appends it as `appendJsonl` does. `redactPatternProblem` says why an extra pattern would be refused.
- `@osdlc/observe/hook` (experimental): `normalizeHook` and `normalizeHookText` read one envelope out of a coding-agent harness's hook payload (harness, event, session id, cwd, transcript path and prompt id), keep the body as sent, and list the fields it lacked. They never throw. `rawString`, `rawNumber` and `rawValue` read the body, and `isPermissionNotification` says whether a `Notification` waits on a person. The harness ids are those `@osdlc/detect-harness` uses.

New runtime dependencies: `@secretlint/core` and `@secretlint/secretlint-rule-preset-recommend`. The redactor loads them on the first text that could hold a secret, not when the entry is imported.
