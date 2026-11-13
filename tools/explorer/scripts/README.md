# Explorer scripts

`build-data.mjs` builds the explorer's `data/ecosystem.json` and `data/plan.json` from the plan's
records in [docs/planning/](../../../docs/planning/README.md). It also rewrites the checklist in
[BEELINE.md](../../../docs/planning/BEELINE.md), between its `<!-- beeline:start -->` and
`<!-- beeline:end -->` lines. The checklist comes from `src/model/beeline.ts`, which uses the Work
view's next-up rule from `src/model/work.ts`. Node loads those TypeScript files directly, so their
imports name the `.ts` file. Edit the records, not the JSON or the checklist, then run it from
`tools/explorer/` and commit the output with the records:

```sh
pnpm build-data
```

It validates the records with `@osdlc/corpus-schema` first: the copy in
`packages/ts/corpus-schema/`, built by `tools/build-corpus-schema.sh`, which knows `extends`. It
reads the task status labels from the planning profile's task schema, which the local one extends,
and the phase labels from the local milestone schema. Then it checks the rules that the validator
does not. Each problem is one line on stderr, and nothing is written. Run twice on the
same records, it writes the same bytes. `tests/build-data.test.mjs` has a case for each rule.

`--corpus <dir>` reads another corpus, and `--out <dir>` writes the JSON to another folder. The
checklist is written to the corpus's own `BEELINE.md`, when it has one. Each `source`
path in the JSON is the record's path from the repo root.
