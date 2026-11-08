# Cases

Each folder holds one case: `corpus/`, a markdown-db corpus, and `expected.json`, what validating it
reports. A case names no code, so a validator in any language can run the same cases.
`tests/cases.test.ts` runs them here.

`expected.json` holds `errors` and `warnings`: the `<file>: <field>` prefix of each problem the
validator reports, with files relative to the corpus root. A validator passes when the set of
prefixes it reports matches, for errors and warnings separately. Message text and order are not
compared, because the standard does not fix them.
