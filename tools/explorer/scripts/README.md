# Explorer scripts

`build-data.mjs` builds the explorer's `data/ecosystem.json` and `data/plan.json` from the plan's
records in [docs/planning/](../../../docs/planning/README.md). Edit the records, not the JSON, then
run it from `tools/explorer/`:

```sh
node scripts/build-data.mjs
```

It reads YAML with the `yaml` package, so `yaml` must be a dev dependency of the explorer. It
writes nothing and lists every problem when a link points at no record of the right type, or when
the records break a rule the corpus-schema validator does not check: a task missing from its
milestone, an `after` cycle, a twin that does not name its pair, or an edge in a state one of its
components is not in. Run twice on the same records, it writes the same bytes.

`--corpus <dir>` and `--out <dir>` read and write other folders.
