# corpus-schema

Status: current.

What a [corpus](corpus.md) can declare about itself on top of its notes: a root file (`corpus-schema.md`, `corpus-schema.yaml` or `corpus-schema.json`) that marks the folder, types of records kept as files, and a JSON Schema for each type. The [corpus-schema spec](https://github.com/osdlc/markdown/blob/main/packages/conformance/corpus-schema/SPEC.md) defines it in levels. Level 0 is any corpus: it declares nothing. Level 1 adds the root file, type folders and records. Level 2 gives every type a schema.

In that spec and in `@osdlc/corpus-schema`, "corpus" alone means a corpus that holds a root file, at level 1 or 2. Everywhere else in this repository it keeps the general meaning.

## In code

`@osdlc/corpus-schema`, in [osdlc/markdown](https://github.com/osdlc/markdown/tree/main/packages/ts/corpus-schema): `findCorpora` finds corpora by their root file, and `validateCorpus` checks one against the spec. It was first defined in osdlc/skillwright, then kept here, and moved to osdlc/markdown.

## How it relates to corpus

Every corpus is at level 0. A corpus at level 1 or 2 is still a corpus: its notes and the files they link to are read as one linked whole. [markdown-corpus](markdown-corpus.md) reads one as it reads any corpus and does not apply the corpus-schema rules.
