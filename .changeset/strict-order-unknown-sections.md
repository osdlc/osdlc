---
"@osdlc/markdown-contract": patch
---

Under strict order, an undeclared section no longer makes a later optional section, or a repeat of a filled repeatable section, `structure/section-order`. Since 0.5.0, an undeclared section allowed by `allowUnknown: true` moved the order check past the optional sections after it, with or without a `gap()` ahead. A document such as `A B X D` (with `D` optional and `X` undeclared) reported `D` as out of order. Now a declared section for a slot that undeclared sections skipped sends the check back to where they started, unless a declared section has filled a slot since. Under `allowUnknown: true`, a gap no longer counts those undeclared sections. With `allowUnknown: false` the undeclared section is still reported, and the declared section after it is no longer reported, unless a gap took the undeclared section: it then had to be in the gap, so the declared section after it is out of order, as before.
