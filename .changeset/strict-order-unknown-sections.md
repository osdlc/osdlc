---
"@osdlc/markdown-contract": patch
---

Under strict order, an undeclared section no longer makes a later optional section, or a repeat of a filled repeatable section, `structure/section-order`. Since 0.5.0, an undeclared section allowed by `allowUnknown: true` moved the order check past the optional sections after it, so a document such as `A B X D` (with `D` optional and `X` undeclared) reported `D` as out of order. An undeclared section now moves the check only to a `gap()` that takes it. With `allowUnknown: false` the undeclared section is still reported, and the declared section after it no longer is.
