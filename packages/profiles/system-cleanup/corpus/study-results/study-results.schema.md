---
$schema: https://json-schema.org/draft/2020-12/schema
x-extends: claims/study-results
title: Study Result
description: >-
  One observation of a store: what a page said, or what a run of a method found, on one occasion.
  The claims profile's study result, plus the fields kind, store, version, version_basis,
  observed, locator and excerpt. The id is the date and a short name.
type: object
additionalProperties: false
x-id-pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2} "
required: [kind, store, observed]
properties:
  kind:
    description: >-
      What was looked at: vendor docs, a changelog, source code, a command's help text, a run of a
      method, an issue thread, a third party's page, or an inference from other study results.
    enum: [docs, changelog, source, help-text, run, issue, third-party, inferred]
  store:
    description: A link to the store the observation is about.
    type: string
    x-ref: stores
  version:
    description: The store version the observation holds for.
    type: string
    minLength: 1
  version_basis:
    description: How the version is known, exact (the source names it), inferred or unknown.
    enum: [exact, inferred, unknown]
  observed:
    description: The date we looked. Not the page's own date.
    type: string
    format: date
  locator:
    description: "Where in the document: a section heading or a line range such as #L10-L20."
    type: string
    minLength: 1
  excerpt:
    description: >-
      The quoted text, as a W3C Web Annotation TextQuoteSelector: the exact words, and optionally
      the text just before and after them.
    type: object
    additionalProperties: false
    required: [exact]
    properties:
      exact: { type: string, minLength: 1 }
      prefix: { type: string }
      suffix: { type: string }
dependentRequired:
  version: [version_basis]
allOf:
  - if:
      properties: { kind: { enum: [docs, changelog, source, issue, third-party] } }
      required: [kind]
    then:
      required: [reportedIn, excerpt]
---

# Study results

One record per observation, in a folder per store, named with the date:
`study-results/pnpm/2026-11-21 pnpm data directories 1.md`. A study result quotes a page, or
records a run of a method. It claims nothing; the statements that cite it make the claims.

A page kind (`docs`, `changelog`, `source`, `issue`, `third-party`) needs `reportedIn`, a link to
the page's document record, and `excerpt.exact`, the words as they appear on the page. Every
excerpt in this corpus was checked against the page text on the day in `observed`. A quote that
holds a Markdown link is left out, since the validator would read the link as one of the corpus's
own.

Study results are append-only. A correction, or a later look that finds something else, is a new
record.
