# Explorer scripts

`build-data.mjs` builds the explorer's `data/ecosystem.json` and `data/plan.json` from the plan's
records in [docs/planning/](../../../docs/planning/README.md). Edit the records, not the JSON, then
run it from `tools/explorer/` and commit the JSON with the records:

```sh
pnpm build-data
```

It validates the records with `@osdlc/corpus-schema` first. Then it checks the rules that the
validator does not. Each problem is one line on stderr, and nothing is written. Run twice on the
same records, it writes the same bytes. `tests/build-data.test.mjs` has a case for each rule.

`--corpus <dir>` reads another corpus, and `--out <dir>` writes to another folder. Each `source`
path in the JSON is the record's path from the repo root.
