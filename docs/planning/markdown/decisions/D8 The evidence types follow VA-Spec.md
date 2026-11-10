---
title: The evidence types follow VA-Spec
status: decided
decided: "2026-11-08"
---

The evidence types follow VA-Spec. VA-Spec is GA4GH's Variant Annotation spec. It is a JSON Schema
model for claims backed by evidence. We use its model, its type names and its field names:
Statement, Evidence Line, Study Result, Method, Document and Contribution. Study results have no
`focus` or `harness` field. What a study result is about comes from the statements that cite it,
because one observation can support statements about several things. Other words come later as name
overrides (task 24).

We looked at other standards for the same idea. Assurance cases name the same parts claim, argument
and evidence: ISO/IEC/IEEE 15026-2, OMG SACM and GSN. OASIS OSLC Quality Management covers tests and
test results. None of them has a JSON Schema for the whole chain. Their words feed the name
overrides and the testing profile.
