---
id: D-04
type: decision
state: proposed
created: 2026-11-13
---

# D-04: Search without an index

Proposed. It waits for the owner's sign-off.

## Decision

- Full-text search has no index and no dependency. Each record's title, string fields and body
  are lowercased the first time a search reads the record, and kept beside the model.
- A record matches when it holds every term as a substring. A phrase in double quotes is one
  term.
- The score is fixed weights: 20 for a term in the title or id, 6 in a field, 2 in the body,
  plus 1 for each further occurrence in a field or the body, up to 4 each. Ties keep the
  corpus's order.

## Why

- Measured on the harness reference (2,417 records, 5.6 MB as JSON): the first search takes
  about 5 ms and later ones about 1 ms. Loading the corpus takes about 600 ms. An index would
  save a millisecond and cost a dependency and a build step.
- Substring matching finds `config` in `configuration` and a file name inside a path, which is
  what a person searching notes expects.
- Fixed weights give the same order on every run and every machine, and the rule fits in one
  sentence of the README.

## When to change it

A corpus of some hundred thousand records, or a need for stemming, fuzzy matching or ranking by
how rare a term is. Then an inverted index, built once per model, can replace the scan behind
the same `search` key. MiniSearch and Orama were not tried, because the scan already answers in
a millisecond.
