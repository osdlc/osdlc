# A food corpus, and the standard for a corpus with its builder

Plan, not code. Written 2026-11-17 for the owner to review before anything is built. The owner
decided the scope, the catalogue, the standard and the rename on 2026-11-17 (see
[Decided by the owner](#decided-by-the-owner)). One question is still open: three corpora or two.
The work is filed as tasks 89 to 96 (see [Phases](#phases)).

## What is asked

1. A corpus of foods from USDA and other sources that an app can optionally ingest.
2. The generation is ported to TypeScript (or Python; this plan recommends one) and the builder
   ships inside the corpora package.
3. A standard for "a corpus with its builder next to it", so every corpus in `packages/corpora/`
   follows it.

## Summary of the recommendations

1. **Three corpora by default, one licence each.** `food-nutrients` (our own nutrient catalogue,
   MIT OR Apache-2.0, owned by osdlc and seeded from determined's notes), `usda-fdc` (USDA
   records, CC0) and, later, `open-food-facts` (ODbL, never merged into the others). `usda-fdc`
   and `open-food-facts` both reference `food-nutrients`. Whether to have three or two is the one
   open owner question: with two, the catalogue starts inside `usda-fdc` and moves out before OFF,
   which changes type identities (see Q1).
2. **Records are JSON.** Foods are one `.json` file each (`formats: [json]`). A food holds its
   nutrient amounts and portions as arrays. Nutrients, categories and releases are their own
   types; portions and amounts are not.
3. **Scope (decided): all SR Legacy and Foundation foods, with a `whole-foods` tag.** The category, word and
   form rules become tags, not deletions. FNDDS is a later phase. Branded is out: it is a lookup,
   not a corpus.
4. **TypeScript, not Python.** The current builder is already TypeScript (bun). osdlc runs
   TypeScript on Node 24, and the one existing builder-in-a-corpus, `harness-reference`, is
   TypeScript.
5. **Pins live in the corpus.** A `releases/` record holds each bundle's URL and sha256 and the
   build's counts. A release bump adds a record and re-runs the builder. Downloads go to a cache
   outside the repo, never committed.
6. **The standard is a convention doc, not a spec change (decided).** `S-corpus-package-shape`,
   enforced by a corpora mode in `@osdlc/package-checks`. The corpus-schema spec keeps describing
   the format only. `harness-reference` renames `src/compile` to `src/build`, so there is one name.
7. **Distribution is an npm package** (`@osdlc/corpus-usda-fdc`), as D11 says, named in
   `references`. The pinned `_references` copy is for links only and is not used for a corpus this
   size. No subtree.
8. **The package also ships a compiled export**, `export/foods.ndjson`, as `harness-reference`
   ships `harness-knowledge`. Apps that do not read corpora (determined's Rust build, the
   dashboard's pack tool) read that. A `datapackage.json` ([Data Package v2](#how-others-ship-nutrient-datasets))
   beside it carries the licences, sources and version, so non-corpus tools can load the export.
9. **determined switches in two steps**: first prove the corpus reproduces its current ndjson
   (a regression oracle), then drop its own rules and keep a thin adapter.
10. **Seven small phases**, each its own PR and its own task (see [Phases](#phases)).

## Prior art, and what it tells us

### In osdlc

| Found | Where | What we take from it |
| --- | --- | --- |
| The format | [`packages/conformance/corpus-schema/SPEC.md`](../../packages/conformance/corpus-schema/SPEC.md), version 0 | Level 2 corpus: root file `<name>.corpus-schema.md`, one folder per type holding `<type>.schema.*`, `.json` records allowed by `formats`, ids from file names, `x-id-pattern`, `x-ref` (forms `link`, `id`, `wikilink`), `references`, identity as purls (`pkg:npm/%40osdlc/<name>@<version>#<type>/<id>`), one version per corpus, the `_references/` copy |
| The validator | [`packages/ts/corpus-schema`](../../packages/ts/corpus-schema/) | `corpus-schema validate --strict` and `sync` are the checks a builder's output must pass |
| Query and site | [`corpus-query`](../../packages/ts/corpus-query/), [`corpus-site`](../../packages/ts/corpus-site/) | `corpus-query` is how an app that wants records reads a corpus. `corpus-site` makes every record a page and its search index one file; its README measured 2,417 records and says it is not for "many tens of thousands". About 8,300 food records is about three and a half times what it measured, which needs a trial build in phase 4; Branded is far outside it |
| A corpus with a builder | [`packages/corpora/harness-reference`](../../packages/corpora/harness-reference/) | `corpus/` holds the records and the root file; `src/compile/` holds a TypeScript builder with `node --test` tests; `package.json` scripts `validate`, `capture`, `lint`, `compile`, `test`, `typecheck`, `check`; a CI workflow runs `check`; the compiled file ships in another package (`@osdlc/harness-knowledge`). It is private, and its builder is not in a tarball |
| A published corpus | [`packages/corpora/sdlc-starter`](../../packages/corpora/sdlc-starter/) | `"corpus": "corpus"` in `package.json`, `files: [corpus/, README, licences]`, `publishConfig.access: public`, profile as `peerDependencies`, licence `MIT OR Apache-2.0`. No code |
| Examples | [`packages/corpora/examples`](../../packages/corpora/examples/) | How `references` plus a committed `_references/` copy is written and tested |
| Decisions | [D11](markdown/decisions/D11%20Upstream%20corpora%20travel%20as%20npm%20packages.md), [D12](markdown/decisions/D12%20Inherited%20records%20come%20in%20as%20a%20committed%20copy.md) (partly superseded by D15), [D15](markdown/decisions/D15%20Extending%20types%20and%20referencing%20corpora%20are%20separate.md), [D19](markdown/decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md) | Upstream corpora are npm packages; records come in through `references`; corpora live in this repository |
| A related task | [Task 85, Fitness corpus trial](markdown/tasks/85%20Fitness%20corpus%20trial.md) | The fitness vault in sksizer/dev holds foods and nutrients and imports FoodData Central. Task 85 converts the whole vault. **This plan must not collide with it**: foods and nutrients should come from the corpora planned here, and the vault's own food notes should reference them. Task 85 now carries a note saying so |
| The gap in the standard | [`packages/README.md`](../../packages/README.md) | It says profiles and corpora "hold Markdown and JSON Schema and no code" (lines 21 to 22). `harness-reference` already breaks that. The standard below fixes the sentence |

Nothing in `packages/ts/` (checked: the list in `packages/ts`, including `config-layers`,
`conformance-suites` and `harness-knowledge`) reads CSV, downloads and hash-checks an archive, or
models a food. So the builder brings its own small CSV reader and cache code. `harness-knowledge`
is the model for the compiled export. A shared "download with a pinned hash" helper is worth
extracting only if a second corpus needs it.

### In sksizer/dev (read at `origin/main`)

**The current pipeline is already TypeScript.** The ndjson is produced by
`solutions/determined/scripts/foods/build-usda-pack.ts` (bun) with its rules in
`scripts/foods/rules.ts` and a test in `build-usda-pack.test.ts` with CSV fixtures. Decision
D-0041 (in sksizer/dev, `solutions/determined/docs/decisions/D-0041-usda-food-slice-ships-as-a-data-pack.md`)
gives the reasons. So "port to TypeScript" is mostly a move, a decoupling and a change of what
comes out. Python is not needed.

What the script does, and how each part ports:

| Step in `build-usda-pack.ts` / `rules.ts` | Port |
| --- | --- |
| Hand-written RFC 4180 CSV reader, streaming, columns found by header name | Moves as is, with its tests. Zero dependencies. Reuse over a CSV package: it is about 50 lines and already fits the bundles |
| Category rule: SR Legacy `food_category.description` in a list of 13 (`CATEGORIES`); Foundation keeps all | Becomes a tag. The corpus keeps every food and every category; `whole-foods` is set when the category is in the list (or the food is Foundation) |
| Word rule: `DROP_WORDS` such as `prepared`, `with `, `mix`, `sweetened`, `smoked`; `un`/`not ` exemptions | Becomes a tag test: a food that matches any word is not `whole-foods`. The rules file moves as is (`src/build/rules.ts`) |
| Powder and juice rules (allowed only in Spices and Herbs, Fruits) | Same, as part of the tag test |
| Form rule: split a description at its first form segment (`raw`, `cooked`, `boiled` ...), strip grade and trim qualifiers, keep at most three rows per base (no form, raw, best cooked) by form rank then lowest `fdcId` | This rule drops rows, so it cannot be a per-row tag. Port as a *group* tag: the builder computes the kept rows per base and tags them `whole-foods`. It stays deterministic (ties by lowest fdc id) |
| "Curated" rule: skip foods whose FDC id or lower-cased name is already in the 300 hand-written notes of the fitness vault | **Does not port.** It reads determined's notes, which are not the corpus's business. It moves to the consumer adapter in determined (phase 6) |
| Trim nutrients to the catalog: the builder reads `fdc_nutrient_number` and `sort_order` from the vault's `Nutrients/` notes (68 of them) | Becomes the `nutrients` type in `food-nutrients`. The builder reads its own corpus, not a vault in another repository |
| `nutrient.csv` number match (`"208"` and `"208.0"`), first of duplicate rows wins, `food_nutrient_derivation` code to `basis` (`A` analytical, `L*` label, else calculated) | Moves as is |
| Portions from `food_portion.csv` with `measure_unit.csv`, the label rule, stable id `food_portion.id`, rows with no grams dropped | Moves as is. The portion's FDC id is kept as `fdc_id` so a consumer can make a stable id (see T-9NJZ in dev) |
| Foundation: keep only `foundation_food` rows of `food.csv` (the bundle also carries about 75,000 sub-samples) | Moves as is |
| Manifest: release, download date, sha256 of every CSV read, per-rule counts, output sha256 | Becomes a `releases/` record plus the build's report. Counts stay, as the check that a rule change is visible |
| `confidenceOf` (0.9 Foundation, 0.75 SR Legacy) | Does not port. Confidence is determined's trust model. The corpus keeps the facts (`data_type`, `basis`); the adapter derives confidence |

The counts the manifest records for the current build are the oracle for phase 4: SR Legacy 7,793
read, 2,998 kept; Foundation 469 read, 93 kept; total 3,091 foods, 135,411 nutrient rows, 5,621
portions; output 5,658,029 bytes, sha256 `618184ab...`. They include the "curated" and
nutrient-catalog effects, so the corpus's `whole-foods` slice will be larger (it should hold the
3,091 plus the 77 and 321 foods the curated rule removed) and the adapter must remove them again.

**The consumers.**

- **determined-fitness.** `build/corpus.rs`, `persistence/seed.rs`: embeds `foods-usda.ndjson`
  with `include_str!`, loads it as pack `foods-usda` (tag `usda`), stamps `pack_id` on `foods`,
  `food_nutrients` and `food_portions`, and re-applies when the folded version hash changes. Ids
  are `usda-<fdcId>`; upstream identity is an `external_refs` row with system `fdc` (and `off`
  for Open Food Facts); `kind` is `foundation | sr-legacy | survey | branded | recipe | custom`.
  `food/fdc.rs` is the live API client (`foods/search`, `food/{fdcId}`, key in the query string)
  and `food/off.rs` the live OFF client (10 searches and 100 product reads per minute, a
  `User-Agent`). D-0041 already decided that OFF is *lookup only*, because ODbL share-alike would
  attach to the app's own food table if merged. This plan keeps that rule: no OFF contents are
  copied into a food table; an id pointer is allowed (see the OFF section).
- **Personal dashboard.** `solutions/personal/dashboard/server/schemas/documents/food.json`:
  per-100 g `nutrients` object with flat keys (`energy_kcal`, `protein`, ...) whose descriptions
  carry the USDA number; `common_portions [{name, grams}]`; `upstream {system, id, fetched_at,
  data_type}` with `system` one of `usda_fdc | open_food_facts` and `id` a string (a barcode keeps
  leading zeros); `gtin`; `source` one of `usda_sr_legacy | usda_foundation | usda_branded |
  open_food_facts | nutrition_label | manual`. `lib/food-upstream.mjs` reads a legacy `usda_fdc_id`
  as `usda_fdc`.
- **T-H7QD** (`solutions/personal/docs/planning/tasks/T-H7QD-*.md`, approved): a pack is a folder
  `packs/<id>/` with `pack.json` (id, version, licence, attribution), `food.jsonl` with stable
  `_id`s (`food:{slug}`), installed by `scripts/pack.mjs` with a three-way content-hash check per
  record, each record stamped `provenance.kind: pack`. A corpus package is the *source* of such a
  pack, not the pack.
- **T-F9KM phase 3**: `scripts/backfill-food-upstream.mjs` asks FDC online (key in
  `~/.config/dashboard/env`, 1,000 requests an hour per IP) for each hand-made food and proposes
  an `upstream` id. An offline corpus can replace the lookup for SR Legacy and Foundation: match by
  name against the corpus with `corpus-query`, no key, no rate limit. It cannot replace it for
  Branded or for newer data; keep the live path for those.

## External survey

All pages read on 2026-11-17. A line marked *not confirmed* means the page did not state it, and
the fact must be checked before the plan's phase that depends on it.

### USDA FoodData Central

- Datasets, from [fdc.nal.usda.gov/download-datasets](https://fdc.nal.usda.gov/download-datasets/):

  | Dataset | Latest | Cadence | Formats | Size (zip / unzipped) |
  | --- | --- | --- | --- | --- |
  | Foundation Foods | October 2026 | about April and October | JSON, CSV | CSV 4.1 MB / 35 MB |
  | SR Legacy | April 2018 | final, never updated | JSON, CSV | CSV 6.7 MB / 54 MB |
  | FNDDS (Survey) | October 2024 (FNDDS 2021-2023) | every two years | JSON, CSV | CSV 200 MB / 1.6 GB |
  | Branded | October 2026 | about April and October | JSON, CSV | CSV 432 MB / 3 GB |
  | Full download, all types | October 2026 | with any type | CSV only | 463 MB / 3.1 GB |

  **Release bump to note now**: Foundation 2026-10 exists. determined pins 2026-04-30.
  T-H7QD in the dev repo says Branded is monthly; the download page now says April and
  October. Take the page, and treat cadence as something the builder records, not assumes.
- Licence and terms, from [the API guide](https://fdc.nal.usda.gov/api-guide/): data is CC0 1.0;
  credit is requested, not required (suggested citation "U.S. Department of Agriculture,
  Agricultural Research Service. FoodData Central, 2019. fdc.nal.usda.gov."). The download page
  itself states no licence. The package should cite the API guide for it.
- API terms, same guide: a data.gov key on every request, 1,000 requests an hour per IP, an hour's
  block and HTTP 429 above it, `DEMO_KEY` 30 an hour and 50 a day. Endpoints `/food/{fdcId}`,
  `/foods`, `/foods/list`, `/foods/search`. Keys found in public repositories are deactivated, so
  no key ever goes in a builder, a fixture or a manifest.
- Consequence: the builder reads bulk files, never the API. No key, no rate limit, and the sha256
  of the file is the identity of the input.

### Open Food Facts

- From [world.openfoodfacts.org/data](https://world.openfoodfacts.org/data): nightly dumps in
  MongoDB, JSONL (gzip), Parquet (on Hugging Face), tab-separated CSV (food: about 0.9 GB
  compressed, 9 GB unzipped), daily delta files covering 14 days that **cannot report deletions**,
  RDF (not maintained). Database under ODbL, contents under DbCL, images CC BY-SA. Attribution:
  "Contains data from Open Food Facts, available under the Open Database License."
- From the [ODbL 1.0 text](https://opendatacommons.org/licenses/odbl/1-0/): a *Derivative
  Database* is one based on the database, and extracting or reusing a substantial part of its
  contents into a new database makes one (4.4(b)); a derivative that is publicly used must be
  offered under ODbL (4.4(a)); a *Produced Work* made from it needs a notice, not share-alike,
  unless it makes a Derivative Database publicly used (4.4(c)); a *Collective Database*, the
  database unmodified inside a collection of independent databases, need not be licensed under
  ODbL (4.5(a)); internal use of a derivative is not public use (4.5(c)). The
  [ODbL summary](https://opendatacommons.org/licenses/odbl/summary/) says it does not address
  separate data used alongside. The OFF wiki page on the licence refused automated reads
  (bot protection); *not confirmed from OFF's own wording*. This is not legal advice.
- **What a separate OFF corpus means.** A corpus that holds OFF-derived records is a Derivative
  Database: it must be ODbL, and so must anything that copies those records into a table.
  **Referencing OFF by id is different.** A corpus may refer to an OFF record by its id only: a
  plain `gtin` or `off` string field, or an `x-ref` with `x-ref-form: id`. It never copies OFF
  contents and never bundles the OFF corpus through a `_references` copy. The reasoning is that a
  pointer (a barcode) is not an extraction of a substantial part of the contents, so it makes no
  Derivative Database (4.4(b)). This is a reading of the licence text at
  <https://opendatacommons.org/licenses/odbl/1-0/>, **not legal advice**; the owner decides before
  the OFF phase. Two limits follow from the spec. First, an `id`-form `x-ref` must resolve to a
  record in the corpus or in a corpus it `references` (SPEC, Typed references), so using it for
  OFF ids needs the OFF package in `references`, installed but not copied; a plain `gtin` string
  needs nothing. The default for `usda-fdc` is the plain string. Second, USDA records never
  contain OFF data. An app that ingests the OFF corpus into the same table as USDA foods makes
  that table a derivative and, if public, ODbL: the owner's D-0041 concern. The OFF package must
  say so in its README, and ingestion must be opt-in.
- Size: OFF is millions of products; no whole-database corpus is practical. The OFF corpus is a
  builder plus a small slice (a country, a category or a list of barcodes).

### Other national tables

| Source | Facts found | Licence | Verdict |
| --- | --- | --- | --- |
| Canadian Nutrient File, [Health Canada](https://food-nutrition.canada.ca/cnf-fce/index-eng.jsp) | 2015 publication, "will not be updating it"; a CNF 2026 dataset is being prepared; relational CSV files | Open Government Licence - Canada on open.canada.ca ([search result](https://open.canada.ca/data/en/dataset/90a31d6a-9131-4f31-a156-cd1f3b2717fe), listing says API database; *CSV resource URL not confirmed*); attribution "Contains information licensed under the Open Government Licence - Canada" | Good second source: compatible licence, CSV. Phase 7 candidate |
| CoFID (UK), [gov.uk](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) | Updated 2021-03-19; Excel spreadsheet only; food count not stated | "All content is available under the Open Government Licence v3.0" (site-wide statement) | Usable; Excel input means an xlsx reader dependency |
| AFCD (Australia, formerly NUTTAB; AUSNUT 2023), [FSANZ](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/about-afcd) | Release 3, 1,588 foods, 58 core nutrients plus about 210 more; Excel files; derivation code per food | **Not stated** on the pages read; *NUTTAB name not confirmed* | Check the copyright page before any plan to ship it |
| Frida (Denmark, DTU), [fcdb.fooddata.dk](https://fcdb.fooddata.dk/) | Site would not render for the reader; a search found version 5.5 (2025) in the [FAO listing](https://www.fao.org/food-composition/tables-and-databases/detail/(denmark--2024)-danish-food-composition-table/en) and a DTU report naming 6.2 | *Not confirmed*: no source found for a licence | Check the licence before any plan |

The pattern: national tables ship as Excel or CSV with a site-wide open licence. A builder
reading one of them is the same shape as the USDA builder, which is the reason for a standard.

### How others ship nutrient datasets

- [Data Package v2.0](https://datapackage.org/), released 2024-06-26
  ([release note](https://frictionlessdata.io/blog/2024/06/26/datapackage-v2-release/)), the
  successor to v1 (2017). `datapackage.json` holds `name`, `version`, `licenses`, `sources` and
  `resources`; data is local files, URLs or inline; each resource may carry a Table Schema. It
  describes tables, not linked records, and has no `x-ref` equivalent, so it does not replace
  corpus-schema. **Adopt it as the export's manifest**: each corpus's `export/` ships a
  `datapackage.json` (licences, sources, version) beside the ndjson, so a tool that knows nothing
  about corpora can load the export. Its vocabulary (`sources`, `licenses`, `version`) also
  shapes the `releases/` record and the README. The v2 field details are to be checked against
  datapackage.org when phase 4 writes the generator.
- npm: a search on 2026-11-17 found no maintained package that ships the whole USDA dataset as
  offline JSON; the results were API wrappers, a deprecated `usda-ndb`, and `eusda`, which
  downloads SR data into a local file. [`ifct2017`](https://github.com/ifct2017/compositions)
  (Indian Food Composition Tables) is the closest model of a packaged table: published to npm and
  JSR, CSV and SQL exports per dataset, a `build.ts`, tests and workflows, and its licence
  changed from MIT to AGPL-3.0 in April 2025, which is why a data package states its licence on
  data and code separately.
- PyPI [`fooddata`](https://pypi.org/project/fooddata/): "download, build, and query the USDA food
  database". The page would not render; only its title was read. It confirms the download-then-build
  approach exists in Python; its detail is *not confirmed*.

No published package does what this plan asks: a cited, versioned, validated, linkable record set
with its builder beside it. That is the reason to build it, and it also means no shape is borrowed
whole.

### Nutrient identifiers

- **FDC nutrient numbers** are USDA's own; OFF uses its own keys. Neither joins to the national
  tables. [FAO/INFOODS food component identifiers (tagnames)](https://www.fao.org/infoods/infoods/standards-guidelines/food-component-identifiers-tagnames/en/)
  are the cross-database key: short codes such as `PROCNT`, `FAT`, `CHOAVL`, `FIBTG`. Each
  `food-nutrients` record carries an `infoods_tagname` beside `fdc_nutrient_number` and `off_key`,
  so adding CNF, CoFID or AUSNUT later is a mapping, not a new catalogue. EuroFIR names are
  recorded as aliases only.
- **A machine-readable source.** [`github.com/infoods/tagnames`](https://github.com/infoods/tagnames)
  and the npm package [`@infoods/tagnames`](https://www.npmjs.com/package/@infoods/tagnames) (read
  2026-11-17). The npm package is version 1.0.1, last modified 2022-04-05, maintained by
  `wolfram77`, licence MIT on npm, description "Food Component Identifiers (Tagnames) by INFOODS".
  It is not an FAO or INFOODS publication. The GitHub address now redirects to `nodef/infoods`,
  whose README is copyright Subhajit Sahu, says AGPL-3.0-or-later, and points to a JSR package
  `@nodef/infoods`. So the licence is inconsistent between npm (MIT) and the current repository
  (AGPL-3.0-or-later), and the licence of the underlying FAO table is not stated. **Provenance
  and licence: unconfirmed.** Do not depend on it or copy its data. Seed the tagnames from the
  FAO page, and check FAO's terms for reuse first.
- **Noted, not adopted:**
  - schema.org `NutritionInformation`: a web-markup vocabulary for labels, with no per-nutrient
    identifiers.
  - W3C DCAT: a catalogue vocabulary for datasets, which Data Package v2 already covers for us.
  - FoodOn: a food ontology (what a food is), not composition data.
  - LanguaL: a food-description thesaurus for indexing foods; no amounts.

## Questions the plan answers

### Q1. Naming and split

**Three corpora by default, as three packages in `packages/corpora/`** (the one open owner question
is three versus two):

| Corpus | npm name | Licence of the data | Holds |
| --- | --- | --- | --- |
| `food-nutrients` | `@osdlc/corpus-food-nutrients` | MIT OR Apache-2.0 (owned by osdlc, seeded from determined's 68 nutrient notes) | `nutrients`, `nutrient-categories` |
| `usda-fdc` | `@osdlc/corpus-usda-fdc` | CC0-1.0, credit to FoodData Central | `foods`, `food-categories`, `releases`; references `food-nutrients` |
| `open-food-facts` | `@osdlc/corpus-open-food-facts` | ODbL-1.0 (DbCL on contents) | `foods`, `releases`; references `food-nutrients`. Never referenced by the other two |

Names follow `@osdlc/corpus-sdlc-starter`. Why not two corpora: the nutrient catalog is not
USDA's. It maps FDC nutrient numbers to the ids determined and the dashboard use and to OFF keys.
If it lives in `usda-fdc`, OFF must reference USDA only to find a nutrient, and moving it out
later changes type and record identities (a purl includes the package name). The cost of the
third package is 68 small records. **Fallback if the owner wants two**: nutrients in `usda-fdc`
now, moved out in the phase that adds OFF, as a breaking change.

OFF's `references` points at `food-nutrients` (our own data), not at `usda-fdc`. The owner's
brief said OFF references USDA; this keeps the licence isolation the brief asks for while making
the dependency the catalog rather than the whole USDA set.

### Q2. Record types

Each type has a JSON Schema at level 2 in its folder.

| Type (folder) | Corpus | Record | Id |
| --- | --- | --- | --- |
| `nutrients` | food-nutrients | One nutrient: `slug`, `name`, `unit` (`g mg ug kcal IU`), `category` (x-ref), `fdc_nutrient_number`, `off_key`, `infoods_tagname` (FAO/INFOODS, e.g. `PROCNT`), `parent` (x-ref, e.g. saturated fat under fat), `sort_order` | the slug (`total-fat`), `x-id-pattern ^[a-z0-9-]+$`, the ids determined already uses |
| `nutrient-categories` | food-nutrients | energy, macronutrient, carbohydrate-component, fatty-acid, amino-acid, vitamin, mineral, sterol, other (determined's list) | slug |
| `foods` | usda-fdc | One food | `usda-<fdcId>`, `x-id-pattern ^usda-[0-9]+$` |
| `food-categories` | usda-fdc | One USDA category | slug of its description |
| `releases` | usda-fdc | One upstream release read by the builder, with pins and counts | `usda-fdc-sr-legacy-2018-04`, `usda-fdc-foundation-2026-04-30` |

**Portions and amounts are not record types.** A food has about 44 nutrient amounts and about two
portions. As records they would be 135,411 and 5,621 files for the current slice, and about 46 files
per food, or roughly 380,000 files across SR Legacy and Foundation. They are arrays in the food record, with
their shape written once in the food schema (`$defs`), because corpus-schema schemas stand alone
and cross-type `$ref` is not allowed. This differs from the five types the brief listed; the
recommendation is four plus the release (as `releases`), and it is a decision in the owner list below (portions embedded).

A food record (JSON, abbreviated):

```json
{
  "fdc_id": "167602",
  "name": "Seaweed, Canadian Cultivated EMI-TSUNOMATA, dry",
  "data_type": "sr_legacy",
  "category": "[Vegetables and Vegetable Products](../../food-categories/vegetables-and-vegetable-products.json)",
  "release": "[SR Legacy 2018-04](../../releases/usda-fdc-sr-legacy-2018-04.json)",
  "upstream": { "system": "usda_fdc", "id": "167602", "data_type": "SR Legacy" },
  "tags": ["whole-foods"],
  "basis": { "amount": 100, "unit": "g" },
  "nutrients": [
    { "nutrient": "energy", "amount": 259, "basis": "calculated" },
    { "nutrient": "protein", "amount": 15.34, "basis": "analytical" }
  ],
  "portions": [
    { "fdc_id": "81702", "label": "0.25 cup", "amount": 0.25, "unit": "serving", "modifier": "cup", "grams": 5, "sort_order": 1 }
  ]
}
```

`nutrient` is a plain string holding a `food-nutrients` id. It sits inside an object in an array, and
the spec allows `x-ref` only on a top-level property or on the `items` of a top-level array (SPEC
v0), so it is not a typed reference: the builder's test checks every id against `food-nutrients`. The `category` and
`release` fields use the `link` form inside the same corpus.

**Format: JSON, not Markdown or YAML.** A food is generated, never hand-edited; nobody opens
3,000 of them in Obsidian (the argument in D-0041). JSON round-trips numbers exactly, is what
the builder emits with no serialiser choice, and diffs stay line-stable if the builder sorts keys
and uses a fixed number format. Markdown would add a body nobody writes. The two catalog types
(`nutrients`, `nutrient-categories`) are hand-edited and may be Markdown with a body, so
`food-nutrients` uses `formats: [md]` and `usda-fdc` uses `formats: [json]`.

`upstream`, `fdc_id` and an optional `gtin`-style string are plain fields; they point at other
systems and copy nothing (see the OFF section for what an OFF pointer may be).

**Folders.** `foods/<category>/usda-<id>.json`. A plain folder inside a type folder holds records
(spec, Records), and the id still has to be unique across folders. A category folder keeps a
directory listing readable. Open: whether to shard further by id range if GitHub's listing of one
folder gets slow (the largest category, SR Legacy "Beef Products", is 936 rows by the dev script's
comment).

### Q3. Ids

| System | Corpus id | Dashboard `upstream` | determined |
| --- | --- | --- | --- |
| USDA FDC | `usda-<fdcId>` (record), `fdc_id: "<fdcId>"` (string) | `{system: "usda_fdc", id: "<fdcId>", data_type, fetched_at}`. `fetched_at` is the release's `downloaded` date | food id `usda-<fdcId>` (already identical); `external_refs` system `fdc`, external id `<fdcId>` |
| Open Food Facts | `off-<gtin>`, `gtin` kept as a string | `{system: "open_food_facts", id: "<gtin>"}` | `external_refs` system `off`. Never a `pack_id` merge (D-0041) |
| Portion | `fdc_id` of the `food_portion` row, inside the food | not mapped (dashboard portions have only `name`, `grams`) | `food_portions.id` built from the portion's FDC id (T-9NJZ) |
| Nutrient | slug | the dashboard's flat key (`energy_kcal` for `energy`) through a table of USDA numbers in the pack tool | catalog `id` (same slug) |

Two facts decide this. The corpus's record id equals determined's food id, so no remapping is
needed there. The dashboard's `upstream.system` value names (`usda_fdc`) differ from determined's
(`fdc`); each consumer's adapter maps, and the corpus stores the dashboard-style value in
`upstream.system` because it is the more explicit name. A food's `source` in the dashboard is
derived from `data_type` (`sr_legacy` gives `usda_sr_legacy`, `foundation` gives
`usda_foundation`).

Cross-corpus identity is the spec's purl:
`pkg:npm/%40osdlc/corpus-usda-fdc@<version>#foods/usda-167602`. An app that stores a purl can
find the record at any version.

### Q4. Scope

- **SR Legacy and Foundation: in, whole.** That is about 7,793 plus 469 foods before the panel
  filter, about 8,300 records. Corpus size is of the order 30 MB of pretty-printed JSON, and about
  5 MB in a tarball; both numbers are estimates from the current 5.6 MB ndjson for 3,091 foods
  (about 1.8 kB per food) and must be measured in phase 4. `corpus-site` can build a site of that
  size (it measured 2,426 pages in about four seconds).
- **Decided:** all SR Legacy and Foundation foods are in, tagged `whole-foods` where the old filters
  would have kept them.
- **Whole versus slice.** The `whole-foods` tag marks what determined and the dashboard preload.
  Consumers choose a tag; the corpus does not delete the rest. This makes the rules a reviewable
  classifier and turns an app's "which foods" question into a filter.
- **FNDDS (Survey):** a later phase, as an optional second tag set, only if an app asks. The CSV is
  1.6 GB unzipped; the builder must stream (it does) and the corpus would be about 5 to 6 thousand
  foods that are mixed dishes. Not in the first release.
- **Branded: out.** 432 MB zipped, 3 GB unzipped CSV, updated twice a year, millions of items,
  each changing. It is a lookup (the live API in `fdc.rs` and the dashboard's T-F9KM), as D-0041
  and the dashboard's food `source` enum already treat it. An app that wants a pantry of branded
  items caches the ones it uses; it does not ingest the dump. A `builder` flag for a barcode slice
  can come later (Branded is never in a corpus).
- **Open Food Facts:** a builder and a small slice (phase 7), opt-in, ODbL. Other corpora refer to it by id only.

### Q5. The builder

- **Language: TypeScript.** The current builder is TypeScript. osdlc builds the corpus validator in
  TypeScript and runs `.ts` on Node 24 with no build step (`harness-reference`'s scripts do
  this: `node src/compile/compile.ts`). Python would add a second toolchain, a second CI job and a
  second set of lint and type rules for the sake of the one library (`pandas` or `pyarrow`) that
  the work does not need: the largest input in scope is a 54 MB CSV. Python is the better choice
  only for OFF's Parquet; if that phase wants it, a Node Parquet reader is the thing to survey then,
  not a reason to choose now.
- **Where it lives:** `packages/corpora/usda-fdc/src/build/` (`fetch.ts`, `read-csv.ts`,
  `rules.ts`, `build.ts`, `export.ts`) with tests in `src/build/*.test.ts` and fixtures in
  `fixtures/`, following `harness-reference/src/compile/`.
- **Download and cache.** `pnpm run fetch` downloads each pinned zip from its URL into a cache
  folder, unzips it into its own empty directory, and checks every CSV's sha256 against the
  release record. Cache: `$OSDLC_CACHE_DIR` if set, else the user cache folder
  (`$XDG_CACHE_HOME/osdlc/corpora/usda-fdc/` or `~/.cache/...`). Never inside the package: a 3 GB
  folder must not enter the workspace, and the repo's `node_modules` and scan rules do not need
  to know about it. `build` never touches the network; it fails with "run fetch" if the cache is
  missing or a hash differs. Downloaded archives are untrusted data: the builder never executes
  anything from them, and unzips with path checks (a zip library choice is part of phase 4; check
  `fflate` and `yauzl` at that point rather than assume).
- **Hash pinning.** The `releases/<id>.json` record holds, per bundle: `url`, `bundle_name`,
  `downloaded` date and the sha256 of each CSV read (the same data as determined's
  `bundles` map). The builder reads its inputs from these pins. The corpus is validated
  against them by `build` itself, which fails on a hash mismatch. `verify` does not touch the cache (see the script table).
- **Reproducibility.** Output is a pure function of the pins, the rules file and the builder
  version: records sorted by fdc id, object keys in a fixed order, numbers parsed once and printed with `String`
  (as the existing script does, so trailing zeros are normalised), no timestamps in
  records (the release record's `downloaded` is an input). `pnpm run build` twice gives the same
  bytes; CI's check is "build from the committed pins and fixtures, diff the corpus". Full builds
  need the 54 MB bundle, so CI builds from *fixtures* (a few hundred rows of real CSV rows, as
  `scripts/foods/fixtures/bundle/` does) and a separate manual or scheduled job runs `fetch`,
  `build` and `git diff --exit-code` against the real release.
- **Release bump.** (1) Run `pnpm run pin -- --bundle foundation --url <new zip url>`: downloads,
  hashes and writes a new `releases/` record, never editing an old one. (2) `pnpm run build`.
  (3) Read the report: per-rule counts and a diff of foods added, removed and changed by fdc id.
  (4) Bump the package version (a new upstream release is a minor bump; a rule change that removes
  or retags foods is a minor bump with a changelog; a changed id scheme is major). (5) PR. Old
  records for a food that changed upstream are replaced, since the package version is the history;
  the old `releases/` record stays so a food's `release` link says which one it came from. A
  food that a new Foundation release dropped is removed and listed in the changelog.
- **Keeping data and code apart.** `usda-fdc`'s `package.json` licence is
  `(MIT OR Apache-2.0) AND CC0-1.0` with a note per path, since the S-package-shape standards
  say "the one licence every library declares" and a corpus of third-party data is not a library.
  The standard (below) states the exception.

### Q6. The standard layout

Add `docs/planning/standards/S-corpus-package-shape.md`, a sibling of `S-package-shape-ts`,
with a rule, an enforcing script and a command, as the standards README requires.

```text
packages/corpora/<name>/
  package.json            name @osdlc/corpus-<name>; "corpus": "corpus"; scripts below
  README.md               what it is, sources and licences, how to reference it, how to rebuild
  LICENSE-*               the code licence; DATA-LICENSE.md when the data's differs
  CHANGELOG.md            per upstream release and per rule change
  corpus/                 the committed output: <name>.corpus-schema.md, type folders, records
    releases/             one record per upstream release read (pins, counts)
  src/build/              the builder, TypeScript, run by Node (no dist)
    *.test.ts             node --test, beside the code, as harness-reference does
  fixtures/               small real excerpts of each input, for tests and CI
  export/                 optional compiled files that ship (e.g. foods.ndjson), and a
                          datapackage.json (Data Package v2: licences, sources, version)
```

`package.json` scripts. `validate` and `check` are required of every corpus. The rest are required of a corpus with a builder:

| Script | Does |
| --- | --- |
| `validate` | `corpus-schema validate --strict corpus` |
| `fetch` | download and hash-check the pinned inputs into the cache (corpora with an upstream) |
| `pin` | add a release record from a URL (the release bump) |
| `build` | cache to `corpus/`, offline, deterministic |
| `export` | `corpus/` to `export/`, with its `datapackage.json` (optional) |
| `verify` | rebuild from the committed fixtures and fail on a diff against `corpus/`. A corpus with no upstream has nothing to rebuild, so `verify` is a no-op there |
| `test` | `node --test 'src/**/*.test.ts'` |
| `typecheck` | `tsc` |
| `check` | `validate`, `test`, `typecheck`, `verify` against fixtures. What CI runs |

Rules:

1. The corpus is the committed source of truth. A builder's output is committed; nothing under
   `corpus/` is hand-edited if a builder owns its type (the schema says so in its prose). Hand-
   edited types (the nutrient catalog) have no builder step.
2. Inputs are pinned by hash in a record in the corpus, not in the builder.
3. `build` is offline and deterministic.
4. Downloads go to a cache outside the package.
5. A corpus that holds third-party data names each source's licence and the credit it asks for in
   its README and in its `releases/` records, and its `package.json` licence covers code and data
   separately.
6. A corpus with a licence that adds obligations (ODbL) declares it in `package.json` and
   `README.md`. No other corpus copies its contents or bundles it through a `_references` copy; a
   pointer by id is allowed (see the OFF section).
7. Published corpora set `"corpus"`, `files` and `publishConfig`, as `sdlc-starter` does, and
   ship `corpus/`, and `export/` with its `datapackage.json` when the corpus has one. Builder source ships too (`src/build/`, `fixtures/`), so a
   consumer can audit and rerun it; its dependencies are `devDependencies`.
8. The version is semver: upstream release or rule change, minor; id change, major.

**Spec or convention? Decided: a convention doc.** The corpus-schema spec is a format with a
conformance suite in several languages; where the builder lives has nothing to do with whether a
validator agrees. A spec change would also bind every implementation (the Rust ones included). The
convention is enforced instead by a `corpora` mode in `@osdlc/package-checks` (it checks
`packages/ts` against `S-package-shape-ts` today; the checks are in
`packages/ts/package-checks/src/`, and no corpus check exists), as phase 1. It also fixes the
sentence in `packages/README.md` that says corpora hold no code. Existing corpora: `sdlc-starter`
needs a `validate` script (it has no `scripts` block today) and a `check` script, and is exempt from the builder scripts because it has no builder; `harness-reference`
conforms after renaming `src/compile` to `src/build` (decided), renaming its `compile` script to `build`, running `validate` with `--strict`, adding `verify`, and either adding `LICENSE-*` and `CHANGELOG.md` or being exempt from them as a private package. The standard
fixes the folder name as `src/build/`.

### Owner review: corpus-schema changes

None proposed. Every rule above is a convention checked by package-checks, and the corpus-schema
spec, its cases and its validator stay as they are. One limit is worth the owner's eye, though no
change is asked for: an `id`-form `x-ref` must resolve to a record in a referenced corpus (SPEC,
Typed references), so it cannot hold an OFF id unless the OFF package is installed and listed in
`references`. Letting such a field hold an unresolved external id would be a spec change; this plan
avoids it by using a plain `gtin` string.

### Q7. Distribution

| Option | Verdict |
| --- | --- |
| **npm package** (`@osdlc/corpus-usda-fdc`), `references: { usda: "@osdlc/corpus-usda-fdc" }` | **Recommend.** Same as D11 and `sdlc-starter`; version pinned by the lockfile; purl identity needs a package; `export/` ships beside it |
| The `_references/` copy (`corpus-schema sync`) | Use only for corpora whose records a *note links to*. A copy of 8,300 files in every consumer's repository is a 30 MB commit. An app that cites a food by id (`x-ref-form: id`) needs no copy. Say so in the README |
| git subtree | Reject. No version, no purl, and 30 MB of generated JSON in another repository's history |
| Publishing a gzipped single file only | Covered by `export/foods.ndjson` for non-corpus consumers |

**The dashboard** consumes it through T-H7QD's pack format, which is a folder in the dev repo:
a small `scripts/foods/make-pack.mjs` there reads the package, picks the `whole-foods` tag,
maps nutrient slugs to the dashboard's keys, writes `packs/foods-usda-whole/pack.json`
(`version` = the package version, `licence: CC0-1.0`, the credit line) and `food.jsonl` with
`_id: food:<slug>`, `upstream` and `source`. The pack format stays the dashboard's; the corpus is
its source. The pack tool's three-way hash check then handles an update. T-F9KM phase 3's
backfill matches a hand-made food to a corpus food offline with `corpus-query` before it calls
the API.

**determined** keeps its embedded ndjson (the Rust build includes it with `include_str!`). A
script there reads `export/foods.ndjson`, applies the curated-notes rule and the confidence rule,
and writes `foods-usda.ndjson` in determined's shape. The package version replaces the manifest's
`release` as the pack's identity; the pack's `corpus_version()` fold stays.

### Q8. Migration of determined

Yes, in two steps, so nothing changes by accident.

1. **Oracle first (no change to determined).** In phase 4 the corpus builder runs on the same two
   bundles determined pins. A test in determined (or a one-off script run once) checks that
   `whole-foods` minus the curated rule, trimmed to the catalog and shaped by the adapter, gives
   the same 3,091 fdc ids, 135,411 nutrient rows and 5,621 portions as the committed
   `foods-usda.ndjson`, and ideally the same bytes (sha256 `618184ab...`).
2. **Switch.** A dev PR deletes `rules.ts` and the CSV reader from `scripts/foods/`, adds the
   package as a dependency, keeps a short adapter (curated rule, confidence, field names,
   `external_refs`) and regenerates `foods-usda.ndjson` and its manifest, where the manifest
   now names the package and its version beside the release. `pack_id` and the seed ledger do
   not change: `foods-usda` is the same pack.

The release bump to Foundation 2026-10 is then a package bump, not a script run. It would change
ids and values in determined's loaded packs, and the seed ledger would re-apply (D-0031). That is
the owner's call per bump, not part of this plan.

## Phases

Each phase is one pull request, small enough to review in one sitting. A phase waits on the one
before it unless it says otherwise. Each is a task record under
`docs/planning/markdown/tasks/`: [89 Food corpus](markdown/tasks/89%20Food%20corpus.md) is the
parent, and phases 1 to 7 are tasks 90 to 96, each waiting on the one before it unless noted.

| # | Phase | Delivers | Done when |
| --- | --- | --- | --- |
| 1 (task 90) | **The standard** | `S-corpus-package-shape.md`, the `packages/README.md` fix, a `corpora` mode in `@osdlc/package-checks`, the `harness-reference` rename `src/compile` to `src/build`, the `compile` script to `build`, `validate --strict`, and `verify` | `pnpm run check:packages` runs the corpora checks; `sdlc-starter` and `harness-reference` pass or are listed with the changes each needs |
| 2 (task 91) | **`food-nutrients`** | The catalogue: 68 records seeded from determined's vault notes, each with `infoods_tagname`, plus nutrient categories; schemas; README; validates `--strict`. The owner decided on 2026-11-17 that the notes seed the public catalogue (see Decided by the owner); task 85 must agree with this task on the catalogue's shape | `validate` passes; ids equal determined's catalog ids |
| 3 (task 92) | **`usda-fdc` builder on fixtures** | `src/build/` ported from `build-usda-pack.ts` and `rules.ts`, schemas for foods, categories, releases; fixtures; tests; `check` green | A fixture build matches golden records; no network |
| 4 (task 93) | **`usda-fdc` first release** | `pin`, `fetch`, and the real SR Legacy 2018-04 and Foundation 2026-04-30 build committed; `export/foods.ndjson` and `export/datapackage.json`; README with licence and credit; changelog | Reproducible: a second `build` gives zero diff; sizes measured and written in the README; the oracle test of Q8 step 1 passes |
| 5 (task 94) | **Publish** | npm publish workflow entry for `usda-fdc` and the `food-nutrients` it references, `0.1.0`, provenance, `corpus-site` page for it (optional) | `npm view` shows both `@osdlc/corpus-usda-fdc` and `@osdlc/corpus-food-nutrients` |
| 6 (task 95) | **Consumers** (in sksizer/dev, two PRs) | (a) determined switches to the package and an adapter; (b) the dashboard pack tool and the T-F9KM offline match | determined's ndjson regenerates equal; the dashboard installs the pack in a dry run |
| 7 (task 96) | **Other sources** (each its own PR, each optional) | `open-food-facts` slice builder and ODbL package; CNF; CoFID; Foundation 2026-10 as a release bump; FNDDS tag set | per source |

Phases 1 and 2 are independent of 3 and can be reviewed in parallel; phase 3 needs phase 2's
catalog and phase 1's layout.

## Risks

- **Size.** 8,300 files per package and a 5 MB tarball are fine for npm and git. A 30 MB
  `corpus/` in the repository makes every `grep` and every checkout bigger; if that hurts, the
  committed `corpus/` can move to a build artifact in the tarball only, at the cost of rule 1.
  Measured in phase 4, decided then.
- **A rule is a judgement.** The `whole-foods` tag is the old filter, ported; its reviewability is
  the reason it stays one short file and its per-rule counts are in the release record.
- **Licence.** CC0 means the data is free to ship. OFF's ODbL and the unconfirmed AFCD and Frida
  terms are the risks; each is a separate package, and none is merged into another.
- **Task 85 overlap.** The fitness vault trial may convert foods in a different shape. Task 85
  now says so; the two must agree on `food-nutrients` before phase 2.
- **Recommendations are not legal advice.** The ODbL reading above is from the licence text and
  needs an owner's call before the OFF phase.
- **Unconfirmed sources.** The `@infoods/tagnames` provenance and licence, AFCD and Frida licences.

## Decided by the owner

On 2026-11-17 ([comment on the plan PR](https://github.com/osdlc/osdlc/pull/866#issuecomment-6968001746)):

- **Scope:** all of SR Legacy and Foundation (about 8,300 foods). Determined's old filters become
  a `whole-foods` tag, and the "curated" rule moves to a determined adapter.
- **Nutrient notes:** determined's 68 nutrient notes seed the public `food-nutrients` catalogue,
  and osdlc owns it afterwards.
- **Standard:** `S-corpus-package-shape` is a convention doc, enforced by a corpora mode in
  `@osdlc/package-checks`. The corpus-schema spec does not change. harness-reference renames
  `src/compile` to `src/build`.

The remaining questions take the plan's recommendation unless the owner says otherwise:

- Foods as JSON and nutrients as Markdown; portions and amounts embedded in the food.
- The builder ships in the tarball (`src/build/`, `fixtures/`), dependencies as devDependencies.
- Licence `(MIT OR Apache-2.0) AND CC0-1.0` for `usda-fdc`, with an exception clause in the
  standard.
- `0.1.0` on determined's pins, then Foundation 2026-10 as a minor.
- Open Food Facts, AFCD and Frida deferred (AFCD and Frida until their licences are
  confirmed). Branded never in a corpus. No Python.

## Open question for the owner

- **Q1. Three corpora or two?** The plan assumes three: `food-nutrients`, `usda-fdc`,
  `open-food-facts`. Recommend three. Fallback: the catalogue lives in `usda-fdc` until OFF and
  moves out as a breaking change.

## Where this plan stands

Not started; the owner's decisions are applied and the tasks are filed. Pull request for review. No datasets were downloaded for it; every fact in the
survey comes from the pages cited, read on 2026-11-17.
