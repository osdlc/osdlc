---
"@osdlc/corpus-schema": minor
---

validate: a profile can ship cross-record rules. A package names a module in package.json (`"corpus-schema": { "rules": "./rules.js" }`) that exports `check(corpus)` and returns problems. After a corpus passes schema validation, `validate` runs the rules of every corpus it extends, at any depth, and reports their problems in the usual `<file>: <field>: <message>` form, as errors or warnings. `--no-rules` skips them. New experimental exports `runRules`, `Problem` and `RulesReport`. Rules come only from `extends` packages, and the spec says a validator may leave them out.
