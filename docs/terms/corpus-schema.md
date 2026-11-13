# corpus-schema

Status: current.

What a [corpus](corpus.md) can declare about itself on top of its notes: a root file (`<name>.corpus-schema.md`, `<name>.corpus-schema.yaml` or `<name>.corpus-schema.json`) that marks the folder and names the corpus, types of records kept as files, and a JSON Schema for each type. The [corpus-schema spec](../../packages/conformance/corpus-schema/SPEC.md) defines it in levels. Level 0 is any corpus: it declares nothing. Level 1 adds the root file, type folders and records. Level 2 gives every type a schema.

In that spec and in `@osdlc/corpus-schema`, "corpus" alone means a corpus that holds a root file, at level 1 or 2. Everywhere else in this repository it keeps the general meaning.

## In code

`packages/ts/corpus-schema`: `findCorpora` finds corpora by their root file, and `validateCorpus` checks one against the spec. First defined in osdlc/skillwright, then moved here. It spent a while in osdlc/markdown and came back with the [Markdown Ecosystem Plan](../planning/markdown/ecosystem-plan.md).

## How it relates to corpus

Every corpus is at level 0. A corpus at level 1 or 2 is still a corpus: its notes and the files they link to are read as one linked whole. [markdown-corpus](markdown-corpus.md) reads one as it reads any corpus and does not apply the corpus-schema rules.
