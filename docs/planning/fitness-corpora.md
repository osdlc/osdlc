# Fitness corpora: muscles, exercises and how a performance is measured

Plan, not code. Written 2026-11-19 for the owner to review before anything is built. It defines
each fitness dataset as a spec that a separate agent can fulfil later: bring the existing data
over, then enhance it. It follows the conventions of the food corpus plan,
`docs/planning/food-corpus.md` in [pull request 866](https://github.com/osdlc/osdlc/pull/866),
and does not repeat it. It changes no schema, spec or package.

The owner's brief: "we should be able to have a muscle corpus, and then have exercises that can
reference muscle corpus etc." and exercise data that supports "a full spectrum of workout types
(weight lifting, duration, distance, cardio and more)". An earlier attempt, "determined fitness",
was on SQLite and "found it limiting early on". Where that project lives is an open question (open question 1).

Filed as tasks 97 to 102 (see [Phases](#order-of-fulfilment)). Task
[85 Fitness corpus trial](markdown/tasks/85%20Fitness%20corpus%20trial.md) is the trial that
converts the whole vault; this plan is the target shape for the model half of it and answers
its first question for the model half (see [Evidence and claims](#6-fitness-evidence)).

## Summary of the recommendations

1. **Three model corpora and one evidence corpus, with no cycles** (the spec forbids two
   corpora referencing each other):
   `muscles` <- `exercises` -> `fitness-vocab`, and `fitness-evidence` over all three. Foods and
   nutrients are not here; they are #866's `food-nutrients` and `usda-fdc`.
2. **`muscles`**: `muscles`, `muscle-groups`, `body-regions`. A muscle carries external ids
   (FMA, Uberon, wger, free-exercise-db) so other datasets map onto it.
3. **`fitness-vocab`**: the small closed and open vocabularies that exercises and activities
   share: `equipment`, `equipment-classes`, `competition-lifts`, `movement-patterns`, `modalities`,
   `variant-axes`, `dimensions`, `measurement-profiles` and `activity-kinds`.
4. **`exercises`**: `exercises` and `movement-families`. An exercise references muscles by role
   (primary, secondary, stabilizer), equipment, a movement pattern and **one measurement
   profile**.
5. **The measurement profile is the design centre.** A *dimension* is one measurable quantity with
   a canonical SI unit (reps, load, duration, distance, power, heart rate, rounds ...). A
   *profile* says which dimensions a performance of an exercise records: required, optional and
   derived, and which one ranks. Strength, bodyweight, holds, carries, machine cardio, running,
   cycling, swimming, rowing, HIIT and sport are all profiles over the same dimensions, so a new
   workout type is a new record, not a schema change.
6. **Two levels, as the platforms have them.** An *activity kind* describes a whole session
   (HealthKit activity type, FIT sport and sub-sport, Health Connect exercise type). An *exercise*
   describes a set or segment inside one. Running is an activity kind and also an exercise.
7. **A performance log is a sketch only** (a session of ordered segments, each a map of dimension
   to value). It is input to a dashboard plan, not a corpus. A profile id replaces the dashboard's
   deferred `exercise.log_kind`.
8. **Ids are slugs** (`x-id-pattern: ^[a-z0-9-]+$`), equal to the ids the vault, the dashboard
   packs and the determined build already use. Cross-corpus references use `x-ref-form: id`, as
   #866 does, so no `_references` copy is needed.
9. **Markdown records** (`formats: [md]`) for all of it: the content is authored and researched,
   the owner browses it in Obsidian, and it is a few thousand files, not hundreds of thousands.
   Where an importer owns a type, it is marked in the schema prose.
10. **Open licence questions block going public** (open question 2). The vault's own content is CC BY 4.0 and
    sksizer/dev is private. Imported muscle text cites Wikipedia (CC BY-SA); wger rows are per-record
    CC; ExRx and MuscleWiki are not reusable. Nothing leaves the private repo until the owner confirms.

## Prior art, and what it tells us

### In osdlc

| Found | Where | What we take from it |
| --- | --- | --- |
| The format | [`packages/conformance/corpus-schema/SPEC.md`](../../packages/conformance/corpus-schema/SPEC.md), version 0 | Level 2 corpus, a type per folder, ids from file names, `x-id-pattern`, `x-ref` with forms `link`, `id`, `wikilink`, `references` by package name, identity as purls, a corpus graph with no cycles |
| The hard limit for this plan | SPEC, Typed references | `x-ref` is allowed only on a top-level property or the `items` of a top-level array. The exercise-to-muscle edge has a role and a weight, which wants an array of objects. See [Gaps](#gaps-in-the-spec-proposed-not-made) |
| The claims profile | [`packages/profiles/claims`](../../packages/profiles/claims/) | `documents`, `methods`, `statements`, `study-results`, from VA-Spec. The evidence half of the vault maps here |
| A corpus with a builder | [`packages/corpora/harness-reference`](../../packages/corpora/harness-reference/) | The model for a corpus that carries claims with citations, built from a research directory |
| A published corpus | [`packages/corpora/sdlc-starter`](../../packages/corpora/sdlc-starter/) | `package.json` shape: `"corpus": "corpus"`, `files`, `publishConfig`, profile in `peerDependencies`, `MIT OR Apache-2.0` |
| The corpus standard | [#866, `S-corpus-package-shape`](https://github.com/osdlc/osdlc/pull/866), task 90 | Layout `corpus/`, `src/build/`, `fixtures/`, `export/`, scripts `validate`, `check` and the rest. Every corpus here follows it, and waits for task 90 |
| The food plan | [#866](https://github.com/osdlc/osdlc/pull/866), tasks 89 to 96 | `food-nutrients` and `usda-fdc` own foods and nutrients. This plan owns none of them |
| The trial | [Task 85](markdown/tasks/85%20Fitness%20corpus%20trial.md) | Asks for the whole vault to become a corpus, and four questions. This plan answers them for the model half |
| Prior packages | `packages/ts`, `../osdlc` workspace | Nothing there models muscles, exercises or workouts. No shared code to reuse; the builders reuse #866's download-and-hash helper if task 92 extracts one |

`osdlc/corpora` is a holding pen; the work happens here in `osdlc/osdlc`, in `packages/corpora/`.

### In sksizer/dev (read at `origin/main`, 2026-11-19)

The vault `packages/vaults/fitness/` is the source. It is generated by `build.mjs` from
`research/` (JSON shards plus importers in `pipeline/`), and is browsed in Obsidian. determined
compiles it into SQLite at build time; the dashboard ships a slice of it as packs.

| Folder in the vault | Count | Becomes |
| --- | --- | --- |
| `Muscles/` | 254 (96 verified, 158 imported at confidence 0.4; 87 trainable) | `muscles/muscles` |
| `Muscle Groups/` | 37 (functional 21, region 7, movement 6, compartment 3) | `muscles/muscle-groups` |
| `Exercises/` | 200, all verified, all strength | `exercises/exercises` |
| `Movement Families/`, `Movement Patterns/` | 34 and 11 | `exercises/movement-families`, `fitness-vocab/movement-patterns` |
| `Equipment/`, `Equipment Classes/`, `Modalities/`, `Variant Axes/`, `Competition Lifts/` | 47, 6, 5, 9, 3 | `fitness-vocab` types (equipment classes describe a *performance*, not a movement) |
| `Activity Kinds/` | 89 (27 sport, 16 endurance, 8 water ...), keyed to HealthKit, FIT and TCX | `fitness-vocab/activity-kinds` |
| `Measures/`, `Panels/` | 91 and 11 (labs, vitals, body) | **Out of scope**: health observations, not fitness. Own plan later (open question 8) |
| `Foods/`, `Nutrients/` | 300 and 68 | #866 |
| `Evidence/`, `Sources/` | 2,736 and about 737 | `fitness-evidence` |
| `Licensed Media/` | 384 rows (wger names and videos, per-record CC) | kept apart, see [Sources and licences](#sources-and-licences) |

What the vault already has that the plan keeps:

- An exercise carries `measure_profile` (`reps_load` 132, `reps_bodyweight` 47, `hold` 15, `carry`
  3, `eccentric` 2, `reps_assisted` 1), `shape_default` (`rep_set`, `timed_set`, `distance_set`),
  `load_default`, `load_required`, `bodyweight_factor`, `force`, `action`, `is_unilateral`,
  `category`, `difficulty`, `axes` (implement, posture, grip, width, assistance, laterality,
  range), `norms`, `default_tempo`.
- `muscles[]` as `{link, role, contribution}`: primary 568, secondary 841, stabilizer 1,264
  across 200 exercises.
- `research/gaps.json` reports 151 unresolved muscle references, 8 unresolved `variation_of`, 20
  duplicates, 22 axis issues and 23 missing `bodyweight_factor`. A fulfilling agent starts from it.
- `RESEARCH-PLAN.md` already works through isometrics (position, load on a hold, unilateral holds).
  The profile design below takes its answers.

What it lacks:

- **Everything outside strength.** All 200 exercises are lifts and holds. Cardio exists only as
  89 activity kinds with `primary_measure` (duration 66, distance 18, volume 5), `has_sets`,
  `has_distance`, `cadence_unit` and `met`. No exercise says "running" or "rowing machine", and
  no record says which dimensions to log.
- **Profiles are strings.** `measure_profile: hold` is an enum in Rust, not a record, so it cannot
  carry units, requiredness or external codes.
- File names are titles (`Ab Wheel Rollout.md`) while `id` is a slug. corpus-schema takes the id
  from the file name and requires `id` in data to match, so every file is renamed to its slug.
- Links are wikilinks by title; the corpus needs `id` references.

The dashboard side (`solutions/personal/dashboard`):

- Packs `fitness-muscles` (254 muscles, 31 groups; the 6 missing are probably the `movement`
  groups, the fulfilling agent confirms), `fitness-equipment` (47), `fitness-exercises` (200),
  `fitness-nutrients` (48), built by `scripts/build-fitness-packs.mjs` from the vault. Ids are
  `muscle:<slug>`, `muscle_group:<slug>`, `equipment:<slug>`, `exercise:<slug>`.
- The `exercise` document: `muscles [{muscle_id, role, contribution}]`, `equipment_ids`,
  `muscle_group_ids`, `movement_pattern`, `force`, `category`, `difficulty`. No measurement
  field. Sets are `{exercise_id, reps, weight_kg, set_type, rpe}`, with `reps >= 1`. Outdoor work is
  a separate `activity` document (`hike|jog|run|walk|bike|sport|other`, distance, duration,
  elevation, ruck weight, GPS path).
- T-D7AU decision 8 proposed `exercise.log_kind` (`weight_reps`, `reps`, `duration`, `distance`) and
  left it unapproved. [Measurement profiles](#3-fitness-vocab-and-the-measurement-profile) replace it.
- T-C5RP and T-H7QD: a corpus is the *source* of a pack, and the pack format stays the dashboard's.
  This plan keeps that: the corpora ship an `export/` (ndjson plus `datapackage.json`, as #866
  does) and the dashboard's pack tool reads it.

determined fitness is not in this repository's reach; see open question 1.

## External survey

All pages read on 2026-11-19. A line marked *not confirmed* means the page did not load or did not
state it; the fulfilling agent checks it before relying on it. Nothing here is legal advice.

### Muscles and anatomy

- **FMA** ([Bioregistry](https://bioregistry.io/registry/fma)): ids `FMA:63189`, pattern `^FMA:\d+$`;
  listed CC-BY-4.0 but the entry is marked deprecated. Another registry snippet says CC BY 3.0
  (RRID:SCR_003379, not opened). Licence *not confirmed*; check the release's own file. Part-of
  and synonym structure *not confirmed* from a primary page.
- **Uberon** ([Bioregistry](https://bioregistry.io/registry/uberon)): ids `UBERON:0001630` (muscle
  organ), CC-BY-3.0 per Bioregistry (GitHub repo returned 403). Relations are `is_a` and `part_of`
  (BFO_0000050), and the basic subset keeps `is_a`, `part_of` and `develops_from`
  ([Ontobee](https://ontobee.org/ontology/uberon-basic), snippet). Has exact synonyms (snippet).
- **Terminologia Anatomica** (IFAA): the Latin names. TA2 is CC BY-ND per a snippet
  ([IFAA help](https://ifaa.unifr.ch/Public/TNAEntryPage/help/HelpUniversalPageEN.pdf)), which
  would forbid redistributing an altered name table. *Not confirmed*. Keep `latin` as a plain field
  and do not copy a TA table.
- **wger** ([README](https://raw.githubusercontent.com/wger-project/wger/master/README.md),
  [muscle API](https://wger.de/api/v2/muscle/?format=json)): 15 muscles, each `name` (Latin),
  `name_en`, `is_front`. Code AGPL-3.0-or-later, **data "Creative Commons (see individual
  entries)"**. A coarse list: it is the proof that wger muscles map to our 254 by id, not a
  source for them.
- **free-exercise-db** ([repo](https://github.com/yuhonas/free-exercise-db), [schema](https://github.com/yuhonas/free-exercise-db/blob/main/schema.json)):
  Unlicense. 17 muscle names for `primaryMuscles` and `secondaryMuscles` (abdominals, abductors,
  adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back,
  neck, quadriceps, shoulders, traps, triceps). These are *groups*, not muscles. It has `force`
  (static, pull, push), `level`, `mechanic` (isolation, compound), `equipment` (12 values),
  `category` (powerlifting, strength, stretching, cardio, olympic weightlifting, strongman,
  plyometrics). Note `category: cardio` and `stretching` exist, yet an exercise has no field for
  what to measure. A fulfilling agent maps these 17 onto `muscle-groups`.
- **ExRx** ([glossary](https://exrx.net/kinesiology/Glossary), snippet; [terms](https://exrx.net/Notes/Legal),
  snippet): names the roles target, synergist, dynamic stabilizer, antagonist stabilizer. Reuse
  needs permission or a licence. **Do not copy ExRx data.** The role names primary, secondary and
  stabilizer are the vault's own and stay.
- **MuscleWiki** ([API terms](https://api.musclewiki.com/api-terms), snippet): forbids redistribution
  and bulk storage. Not a source.

### Exercises and their measurable dimensions

- free-exercise-db (above): 876 rows upstream (vault manifest), no measurement fields at all; its
  `category: cardio` is the only hint. Only 84 are matched to vault exercises; 792 are candidates.
- wger: an exercise has muscles, secondary muscles, equipment, category, variations and
  translations (field names *not confirmed*; the model file returned 404, see
  [the API schema](https://wger.de/api/v2/schema)). Names and videos carry per-record CC licences,
  which is why the vault keeps them in `Licensed Media/`.
- **OpenPowerlifting** ([repo](https://gitlab.com/openpowerlifting/opl-data)): meet data waived of
  copyright (snippet). It models a *performance* (a lifter at a meet): equipment class (Raw,
  Single-ply and others), event, attempts per lift. This is why the vault's `Equipment Classes` and
  `Competition Lifts` describe a performance, not a movement, and no exercise carries one.
- Hevy exercise types, from a secondary summary only
  ([apis.io](https://apis.io/apis/hevy/hevy-exercisetemplates-api/), not opened; Hevy's own docs
  at developers.hevy.com returned only a title): `weight_reps`, `reps_only`, `bodyweight_reps`,
  `bodyweight_assisted_reps`, `duration`, `weight_duration`, `distance_duration`,
  `short_distance_weight`. A second community list uses other names, so the list is *not
  confirmed*. It is still the closest prior art: **an exercise has one type, and the type is a
  closed list of dimension sets.** The type is fixed when a custom exercise is created.
  T-D7AU already cites this.

### Logging across workout types

- **Apple HealthKit** ([HKWorkout](https://developer.apple.com/tutorials/data/documentation/healthkit/hkworkout.json),
  [HKWorkoutActivity](https://developer.apple.com/tutorials/data/documentation/healthkit/hkworkoutactivity.json),
  [HKWorkoutEvent](https://developer.apple.com/tutorials/data/documentation/healthkit/hkworkoutevent.json),
  [HKWorkoutActivityType](https://developer.apple.com/tutorials/data/documentation/healthkit/hkworkoutactivitytype.json)):
  a workout has one activity type (about 84 cases, count approximate), a duration, a list of
  `workoutActivities` that "partition a workout into a set of separate activities", and events of
  type pause, resume, lap, segment and marker. Totals (distance, energy) are deprecated on the
  workout in favour of `allStatistics`: measurements are statistics keyed by quantity type, not
  fixed fields. That is the shape the `dimensions` type takes.
- **Android Health Connect** ([ExerciseSessionRecord](https://developer.android.com/reference/android/health/connect/datatypes/ExerciseSessionRecord),
  [ExerciseSegment](https://developer.android.com/reference/android/health/connect/datatypes/ExerciseSegment)):
  a session has an exercise type (about 70 `EXERCISE_SESSION_TYPE_*`), optional `segments` and
  optional `laps` as two independent lists, an optional route, and a rate of perceived exertion
  (Borg CR10, 0 to 10). A segment has a start, an end, its own type (68 `EXERCISE_SEGMENT_TYPE_*`
  such as `BENCH_PRESS`, `PLANK`, `ROWING_MACHINE`, `SWIMMING_FREESTYLE`, `REST`, `PAUSE`), and
  optional repetitions, weight, set index and RPE. So the platform's own answer to our question is
  the two levels: **session type, and a per-segment exercise type from a second, larger list**.
  Its segment type is a flat enum with no muscles; ours is a record.
- **Garmin FIT**: the activity file has session, lap, length and set messages. A strength `set`
  message holds duration, repetitions, weight, `category`, `category_subtype`, `set_type`
  (active or rest), `wkt_step_index`, confirmed only from a forum thread and snippets
  ([forum](https://forums.garmin.com/developer/fit-sdk/f/discussion/270009/examples-for-encoding-strength-training-activity-files)).
  The `sport`, `sub_sport` and exercise-category enums were *not confirmed* (the Garmin pages
  returned only titles). Rest is a set of its own with its own duration: **rest is a segment**.
  The vault's activity kinds already carry `fit_sport` and `fit_sub_sport`.
- **Strong, Hevy, FitNotes exports**: one row per set naming its exercise, with date, workout name,
  exercise name, set order, weight, reps and an optional RPE; Strong's distance and seconds
  columns are *not confirmed* ([Hevy's import help](https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy),
  snippet). FitNotes' export format *not confirmed* (TLS failure on its site). The Strong export is
  the shape for an import tool and says a set is a flat row.
- **Open mHealth** ([README](https://raw.githubusercontent.com/openmhealth/schemas/master/README.md)):
  its sleep and physical-activity schemas "are superseded by IEEE 1752.1". The unit-value and
  time-frame structure was *not confirmed* from a schema file. Take the idea only: a value, its
  unit, and a time frame. Follow-up: read IEEE 1752.1.
- **schema.org ExerciseAction** ([page](https://schema.org/ExerciseAction)): has `distance` and
  `exerciseType` as text and no duration, reps or weight. Too thin to adopt.
- **Units.** UCUM ([ucum.org](https://ucum.org/ucum), version 2.2) is the code system for unit
  strings: `kg`, `m`, `s`, `W`, `/min`. Its licence terms (Appendix E) were not read, so *not
  confirmed*; dimension records store the code as a string and copy no table.
- **METs.** The [Compendium of Physical Activities](https://pacompendium.com/) says it is free to
  use including commercially, asks for citation, and says "do not change MET values or combine
  activities with different MET levels"; a licence is *not confirmed*. The vault's 81 MET values
  come from it. Keep the compendium code beside the value so the citation is checkable.

**What the survey decides.**

1. Every platform separates *the session* from *the pieces inside it* (HealthKit activities and
   events, Health Connect segments and laps, FIT set and lap messages). The performance sketch
   copies that, and `activity-kinds` and `exercises` are the two vocabularies.
2. Measurements are keyed by a quantity type, not fixed columns (HealthKit statistics). So
   `dimensions` is a type, and a value map is `{dimension-id: number}`.
3. The exercise's type fixes which measurements apply (Hevy). So an exercise names a profile.
4. Rest, pause and warm-up are segments (FIT, Health Connect `REST` and `PAUSE`), not gaps.
5. Nobody in the survey puts muscles on the measurement. Muscles stay a property of the exercise.

No project found does what this plan asks (a linked, versioned, validated corpus of muscles and
exercises that other corpora reference). wger is closest and is a database, not a corpus.

## Design questions the plan answers

### Design question 1. One corpus or several?

**Several: four packages in a chain**, by what changes together and what is licensed together:

| Package | Holds | Why separate |
| --- | --- | --- |
| `@osdlc/corpus-muscles` | muscles, muscle-groups, body-regions | The owner asked for it by name. Anatomy changes slowly, is useful with no exercises (a physio app), and carries the anatomy-text licence question (open question 2) alone |
| `@osdlc/corpus-fitness-vocab` | equipment, equipment-classes, competition-lifts, movement-patterns, modalities, variant-axes, dimensions, measurement-profiles, activity-kinds | Small, closed or slowly-grown lists that two corpora and every app share. Holds the measurement design |
| `@osdlc/corpus-exercises` | exercises, movement-families | The big, growing one: 200 now, 1,000+ with free-exercise-db and wger. References the two above |
| `@osdlc/corpus-fitness-evidence` | claims about the others | Optional. An app that wants the model without the research ships without it (open question 4) |
| (#866) `food-nutrients`, `usda-fdc` | | Not touched |

References form a line with no cycle: `exercises -> muscles`, `exercises -> fitness-vocab`,
`fitness-evidence -> exercises, muscles, fitness-vocab`. `muscles` and `fitness-vocab` reference
nothing, so each stands alone.

Against one corpus: a single `fitness` corpus is simpler to fulfil and keeps every link local
(`x-ref-form: link`), and the types would be `muscles`, `exercises` and so on with no prefix. It
loses separate licences, separate versions (a muscle fix would bump the exercises) and the clean
"muscle corpus" the owner asked for. It is also the layout that is hardest to split later, because
a purl includes the package name (the reason #866 gives for three food corpora). Recommend
several; the fallback is `muscles` standing alone and the rest as one `fitness` corpus.

`fitness-vocab` could be folded into `exercises`. It is kept apart because `activity-kinds` and
profiles are used by things that are not exercises (a run logged from a watch has an activity kind
and no exercise record).

### Design question 2. Formats, ids, references (shared by every dataset)

- **Format**: `formats: [md]`, level 2, one Markdown record per file with the body for prose.
  Reason: authored, researched, reviewed in Obsidian, and a few thousand files. JSON is for
  machine-generated bulk (#866's foods); nothing here is that. An `export/` of ndjson plus a
  `datapackage.json` ships too, as #866 does, for the dashboard pack tool and determined.
- **Id**: the slug, `x-id-pattern: ^[a-z0-9]+(-[a-z0-9]+)*$`. The file is `<slug>.md`, the title is
  a field. It equals the vault's `id` and the dashboard's `<kind>:<slug>` suffix, so no consumer
  needs a remap. A data `id` field, when present, must equal the file name; the vault's does.
  Slugs are never reused for another thing. Renamed things keep the old slug in `aliases`.
- **References**: between corpora, `x-ref` with `x-ref-form: id` and a `references` prefix, so no
  `_references` copy is made (same decision as #866 Q7, its distribution question). Inside a corpus, `link` form or `id`;
  use `id` throughout for one rule. Wikilink titles in the vault become ids.
- **Provenance fields on every record**: `research_status` (`imported` or `verified`),
  `confidence` (0 to 1), `sources` (list of urls), `external_ids` (object of system to string).
  The vault's two-level status and the D-0020 floor (two citations, two publishers) stay.
- **Identity of upstream rows**: `external_ids` is a plain object (no nested `x-ref`, none needed):
  `fma`, `uberon`, `wikidata`, `wger`, `free-exercise-db`, `hk`, `fit`, `compendium`.
- **Units**: SI base in storage: kg, m, s, W, bpm, kcal, rpm. Display units are an app's job.
- **Versions**: semver per package, `0.1.0` first, as #866.

### Gaps in the spec (proposed, not made)

Listed for the owner's review. None is needed to start; each has a workaround.

1. **`x-ref` on a field of an object inside an array** (task 31 already asks for nested `x-ref`).
   The exercise-to-muscle edge is `{muscle, role, contribution}`. Workaround used here: three
   top-level arrays of references, `muscles_primary`, `muscles_secondary`, `muscles_stabilizer`, each
   `items: {x-ref}`, so `--strict` checks them; the weight goes in a plain map `contributions`
   keyed by muscle id, whose keys the builder test checks. If nested `x-ref` lands, the vault's
   original `[{muscle, role, contribution}]` is the better shape and a one-time migration.
2. **A reference to an id in a record body or a statement's `subject`.** The claims `statements`
   `proposition.subject` is plain text, a slug or a link. A slug that names a record in another
   corpus is not checked. Workaround: `fitness-evidence` keeps a `subject` string of the form
   `<corpus>/<type>/<id>` and its builder test resolves it.
3. **A closed vocabulary shared by a reference.** `enum` in each schema repeats a list that a record
   type already holds (`role`, `dimension kinds`). Workaround: roles are enums in the schema (they
   are closed and code branches on them, as the vault's README says); open lists are record types.
4. **Cross-type `$ref`** is not allowed, so the shape of a dimension map is written once per schema
   that has it. Acceptable.

Nothing else in this plan needs a spec change.

## The datasets

Each section is a spec a fulfilling agent can work from. Field tables list the type, whether the
field is required (R) or optional (O) and the unit. Fields every record carries
(`title`, `aka`, `research_status`, `confidence`, `sources`, `external_ids`, see design question 2) are listed once
here and left out of the tables:

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `title` | string | R | Display name. The id is the file name. |
| `aka` | string[] | O | Other names. Resolves aliases when matching imports. |
| `research_status` | `imported` or `verified` | R | `verified` meets the D-0020 floor, two citations from two publishers, one not Wikipedia |
| `confidence` | number 0..1 | R | 0.4 for imported rows, as the vault |
| `sources` | uri[] | O | Required when `verified` |
| `external_ids` | object, string values | O | Keys named per dataset below |

### 1. `muscles`

**Purpose.** An anatomy reference for the muscles a person can train, usable by any app, with the
groups and regions people talk about and the ids of the standard ontologies.

**Package** `@osdlc/corpus-muscles`. References nothing. Types: `muscles`, `muscle-groups`,
`body-regions`.

`muscles` (id `^[a-z0-9]+(-[a-z0-9]+)*$`, for example `rectus-abdominis`):

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `latin` | string or null | R | Anatomical name; plain text, no table copied from TA2 |
| `region` | x-ref `body-regions`, id form | R | |
| `groups` | array of x-ref `muscle-groups` | R, at least 1 | Membership is authored here; a group's member list is a backlink, not a stored copy |
| `part_of` | x-ref `muscles` | O | For a named part of another muscle in this list |
| `heads` | string[] | O | Heads or bellies, names only (27 muscles have them) |
| `trainable` | boolean | R | False for face, larynx, hand, foot and pelvic floor (167 of 254) |
| `actions` | string[] | O | |
| `origin`, `insertion`, `innervation`, `blood_supply` | string | O | Prose, as the vault |
| `synergists`, `antagonists` | array of x-ref `muscles` | O | 94 and 119 have them; keep only those that resolve |
| `tags` | string[] | O | |
| `wikipedia` | uri | O | A link, not text |
| `conflicts` | string or null | O | Where good sources disagree, both readings; caps `confidence` |

External ids: `fma` (`FMA:63189` form), `uberon` (`UBERON:0001630` form), `wikidata`, `wger`
(integer as string), `free-exercise-db` (the group name, see below). The vault has none of these:
the agent adds them, matching by Latin name, and records each match's method in the body.

`muscle-groups`: `kind` (enum `functional`, `region`, `compartment`), `parent` (x-ref
`muscle-groups`, acyclic), `region` (x-ref `body-regions`), `short_name`, `tags`, `wikipedia`.
`external_ids`: `free-exercise-db` carries the 17 names of that dataset (`lats`, `traps`,
`lower back`...), so its rows map to a group.
**The vault's six `movement` groups (Push, Pull, Hinge ...) are dropped from this type**; they
duplicate `movement-patterns` in `fitness-vocab`. The dashboard pack already carries 31 of 37, which
matches. The agent confirms which six and moves them.

`body-regions`: `upper-body`, `lower-body`, `core`, `full-body`; each with an `aka` for the
dashboard's `upper` and `lower` so its `body_region` maps. Four records now; it is a type so a
later finer split (head, neck, arm) needs no schema change.

**Sources and licences.** The vault's own authored data is CC BY 4.0. The 158 imported muscles carry
anatomical prose (origin, insertion, innervation) whose provenance the vault's Attributions file
does not state, and their sources are Wikipedia pages (CC BY-SA 4.0, *to confirm*). **Blocked on open question 2.**
FMA and Uberon ids are identifiers; the ontologies' own licences (CC BY 3.0 or 4.0, see the
survey) matter only if their labels or hierarchy are copied, so the corpus stores ids and not
their labels. Do not copy ExRx, MuscleWiki or the TA2 name table.

**Already supplied.** All 254 muscles, 37 groups, region as an enum on both; 96 verified.
`research/muscles/shard-*.json` is the source; `build.mjs` writes `Muscles/` and `Muscle Groups/`.
**Gaps.** Files named by title, links by wikilink; no external ids; 158 muscles at confidence 0.4
with no secondary source; 151 exercise references do not resolve (`External Oblique` in an exercise
against `Abdominal External Oblique` in the muscle list: a naming mismatch for the agent to settle
with `aka` and `part_of`, not by dropping the reference); images dropped (their licences differ
from the data's); `corrections` history moves into the record body.

**Acceptance.**

1. `corpus-schema validate --strict corpus` passes.
2. 254 muscles unless the agent documents a merge, and every muscle has at least one group and a
   region. Every group's `parent` chain ends at a root with no cycle.
3. No `kind: movement` group remains.
4. At least 90% of muscles have an `fma` or `uberon` id; the rest list why in the body.
5. Every record's id equals its slug in the dashboard's `muscle:<slug>` and `muscle_group:<slug>`
   packs (a test reads the pack's ids).
6. `export/muscles.ndjson` and `datapackage.json` exist.

### 2. `fitness-vocab` types that are plain lists

**Package** `@osdlc/corpus-fitness-vocab`. References nothing. The plain-list types:

| Type | Count now | Fields beyond the common ones |
| --- | --- | --- |
| `equipment` | 47 | `family` enum (`free-weight`, `machine`, `cable`, `bodyweight`, `band`, `cardio-machine`, `implement`, `facility`, `other`), `sort_order`. The dashboard's coarse `equipment` enum (barbell, dumbbell, kettlebell, machine, cable, bands, bodyweight, trap_bar, other) is derived from `family` and `aka`. `external_ids.free-exercise-db`: its 12 equipment labels |
| `equipment-classes` | 6 | OpenPowerlifting's Raw, Wraps, Single-ply, Multi-ply, Unlimited, Straps. Describes a performance, so no exercise carries one |
| `competition-lifts` | 3 | `code` (B and so on) |
| `movement-patterns` | 11 | `sort_order`. Add `locomotion` and `jump` (needed for cardio and plyometrics) |
| `modalities` | 5 | free weights, cable, machines, calisthenics, functional |
| `variant-axes` | 9 | `values`: closed string list (implement, posture, grip, width, assistance, laterality, range, stance, angle). An exercise's `axes` object is checked against these by the builder test |

**Gaps.** `equipment` has no cardio or pool equipment (treadmill, stationary bike, rowing
ergometer, elliptical, ski erg, air bike, jump rope, pool, open road, track): about 15 to add, since
without them a cardio exercise has no equipment to name. Movement patterns `Isolation` and `Core`
are categories, not patterns; the agent decides whether to keep them (the vault's gaps file lists 9
family issues) and records the choice. The 6 `equipment-classes` and 3 `competition-lifts` come
from OpenPowerlifting (public domain, snippet), so there is no licence blocker.
**Acceptance.** `--strict` passes; counts at least the table's; every `family` set; every value of
the vault's `modality`, `movement_pattern` and `equipment_all` resolves in these types
(`research/gaps.json` is the check).

### 3. `fitness-vocab` and the measurement profile

This is the part the owner cares most about. Two types, plus `activity-kinds` (end of this section).

**The problem.** An exercise must say what a performance of it records. A barbell squat is reps and
load. A plank is a duration. A farmer's carry is distance and load. A 5 km run is distance and
duration, with heart rate and cadence if a watch gave them. A machine row is duration and a
resistance level. A burpee EMOM is reps inside timed rounds. The vault does this with six enum
strings in Rust (`measure_profile`) and, for cardio, with a different record type that has no
profile at all. The dashboard has nothing; T-D7AU proposed four values.

**The design: dimensions, then profiles over them.**

`dimensions`: one record per measurable quantity.

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `quantity` | enum `count`, `mass`, `length`, `time`, `speed`, `power`, `rate`, `energy`, `ratio`, `score`, `category`, `text` | R | What kind of thing it is |
| `unit` | string | R | UCUM code of the stored unit: `kg`, `m`, `s`, `W`, `/min`, `kcal`, `%`, `1` (a pure count) |
| `value_type` | enum `integer`, `number`, `enum`, `string` | R | |
| `min`, `max` | number | O | Validity range, for example RPE 1 to 10 |
| `values` | string[] | O | For `value_type: enum`: `side` is `left`, `right`, `both` |
| `aggregation` | enum `sum`, `max`, `mean`, `last`, `none` | R | How a total over segments is made: reps sum, load max, heart rate mean |
| `direction` | enum `higher`, `lower`, `none` | O | Which is better; pace lower, load higher |
| `derived_from` | array of x-ref `dimensions` | O | With `formula` (text), for derived ones such as `speed` from distance and duration |
| `external_ids` | object | O | `hk` (HealthKit quantity type), `fit` (FIT field), `health-connect` (record field), `ucum` where useful |

Starting list, about 28: `reps`, `load` (external or added mass), `assistance` (mass taken off),
`duration`, `distance`, `elevation-gain`, `incline`, `speed` (derived, shown as pace), `power`,
`cadence`, `resistance-level` (a machine's own scale, a `score`), `heart-rate-avg`, `heart-rate-max`,
`heart-rate-zone` (1 to 5), `energy`, `rpe` (1 to 10, as Health Connect's Borg CR10 and the
dashboard), `rir`, `rounds`, `lengths` (pool), `strokes`, `stroke-type`, `side`, `tempo` (text such
as `3-1-1-0`), `range-of-motion`, `score` (sport). The fulfilling agent may add; a new dimension is
a new record, never a new schema field.

`measurement-profiles`: one record per way of measuring.

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `summary` | string | R | One line |
| `shape` | enum `set`, `timed`, `distance`, `continuous`, `rounds`, `score` | R | How a performance is entered: `set` is a count of repetitions, `timed` a time under tension, `distance` a distance, `continuous` an open-ended effort with a total, `rounds` a repeated pattern. Maps the vault's `rep_set`, `timed_set` and `distance_set` |
| `required` | array of x-ref `dimensions`, at least 1 | R | A segment must have these |
| `optional` | array of x-ref `dimensions` | O | A segment may have these; a form asks for these only on request |
| `derived` | array of x-ref `dimensions` | O | Computed from the others, never entered (speed, volume) |
| `primary` | x-ref `dimensions` | R | The dimension a record or a ranking is by: load for a lift, duration for a hold, distance for a carry |
| `load_mode` | enum `external`, `added`, `assisted`, `none` | R | How `load` reads. `added` and `assisted` use the exercise's `bodyweight_factor` |
| `legacy_ids` | string[] | O | The vault's `measure_profile` values this replaces |
| `external_ids` | object | O | `hevy` where a Hevy type matches, *to confirm* |

Initial profiles (about 14; each needs one verified exercise, see acceptance):

| Profile | Required | Optional | Primary | Replaces |
| --- | --- | --- | --- | --- |
| `reps-load` | reps, load | rpe, rir, tempo, side | load | vault `reps_load` (132 exercises), `log_kind: weight_reps` |
| `reps-bodyweight` | reps | load (added), rpe, tempo, side | reps | `reps_bodyweight` (47) |
| `reps-assisted` | reps, assistance | rpe | reps | `reps_assisted` (1) |
| `reps-only` | reps | rpe, side | reps | `log_kind: reps` |
| `eccentric` | reps, load, tempo | rpe | load | `eccentric` (2) |
| `hold` | duration | load (added), side, rpe | duration | `hold` (15), `log_kind: duration` |
| `carry` | distance, load | duration | load | `carry` (3) |
| `duration-only` | duration | rpe, energy, heart-rate-avg | duration | stretching, yoga, mobility |
| `distance-duration` | distance, duration | elevation-gain, heart-rate-avg, heart-rate-max, cadence, power, energy, rpe | distance | running, walking, cycling, rowing, `log_kind: distance` |
| `machine-cardio` | duration | distance, resistance-level, incline, speed, cadence, heart-rate-avg, energy | duration | treadmill, bike, elliptical, stair climber |
| `swim` | distance, duration | lengths, strokes, stroke-type, heart-rate-avg | distance | pool and open-water swimming |
| `rounds-reps` | rounds | reps, load, duration | rounds | AMRAP and for-time work |
| `sport-session` | duration | distance, score, heart-rate-avg, energy | duration | team and racquet sport |
| `zone-effort` | duration, heart-rate-zone | heart-rate-avg, distance | duration | zone training |

**What the design does for each workout type the owner listed.**

- *Weight lifting*: `reps-load`. *Bodyweight*: `reps-bodyweight`, with `bodyweight_factor` on the
  exercise (kept from the vault) turning body mass into load for volume. *Isometric holds*: `hold`,
  which is the vault's answer in RESEARCH-PLAN: load optional and added, score
  `body x factor + added load`. Repeated short holds are several timed segments, as that plan says.
- *Duration, distance, pace*: `duration-only`, `distance-duration`. Pace is not stored. It is
  `speed` derived from the two, shown as min per km by the app, as HealthKit keeps totals as
  statistics and not fixed fields.
- *Heart-rate zones*: `heart-rate-zone` as a dimension and `zone-effort` as a profile; average and
  max are optional on the cardio profiles.
- *Running, cycling, rowing, swimming*: `distance-duration`, `machine-cardio`, `swim`, with cadence,
  power and elevation as optional dimensions.
- *Rounds, intervals, HIIT*: **intervals are structure, not a profile.** A 30 s on, 30 s off block
  repeated eight times is eight pairs of segments (an `active` one and a `rest` one, as FIT's set
  message and Health Connect's `REST` segment do), each using the exercise's own profile. An AMRAP's
  result is `rounds-reps`. The block pattern (EMOM, Tabata, circuit, superset) is a field of the log
  (below), so a new format needs no corpus change.
- *Sports*: `sport-session`, usually reached through the activity kind's default.

**What an exercise adds.** It names exactly one `measurement_profile`, and may list
`measurement_extra` dimensions beyond the profile (a treadmill run adds `incline`). Anything else a
log carries is checked against the profile, so a form knows what to ask for.

**The vault's fields this absorbs.** `measure_profile`, `shape_default` (the profile's `shape`),
`load_default` and `load_required` (the profile's `load_mode` and `required`) go; the agent's
mapping table for the 200 exercises is the six `legacy_ids`, and the brief says to assert every
exercise lands on a profile with the same shape as its old `shape_default`. `bodyweight_factor`,
`norms` and `default_tempo` stay on the exercise. `norms` becomes an object keyed by dimension id:
`{"reps": {"typical": 8, "target": 12}}`, `{"duration": {"typical": 30, "target": 60}}`.

**`activity-kinds`** (same package). The 89 vault records, a type of its own because a session has a
kind whether or not it has exercises.

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `category` | enum | R | sport, endurance, water, snow, other, mind-body, dance, strength, combat, recovery, multisport (the vault's 11) |
| `default_profile` | x-ref `measurement-profiles` | R | Replaces `primary_measure`, `has_sets`, `has_distance` |
| `met` | number or null | O | From the Compendium, with its code in `external_ids.compendium` so the value is checkable and unaltered |
| `has_track` | boolean | O | A GPS route is normal |
| `cadence_unit` | enum `rpm`, `spm`, null | O | |
| `external_ids` | object | O | `hk` (`HKWorkoutActivityTypeAmericanFootball`), `fit-sport`, `fit-sub-sport`, `tcx`, and new `health-connect` (the `EXERCISE_SESSION_TYPE_*` name) |

Gaps: no Health Connect names yet; 8 of 89 have no MET; the dashboard's coarse
`hike|jog|run|walk|bike|sport|other` maps by `aka` and `external_ids`. **Acceptance for the whole
vocabulary corpus:** `--strict` passes; every `required`, `optional`, `derived` and `primary`
reference resolves (the schema checks it); every profile's `primary` is in `required`; every
dimension's `unit` parses as UCUM (a test with a small parser; no table copied); each of the 14
profiles is used by at least one exercise in `exercises` (a cross-corpus test run in `exercises`);
every activity kind has a `default_profile`; counts at least 89 kinds.

### 4. `exercises`

**Purpose.** The loggable movements and efforts, each with the muscles it works, the equipment it
needs, how it is measured, and its place among variants.

**Package** `@osdlc/corpus-exercises`. `references`: `muscles` (`@osdlc/corpus-muscles`) and
`vocab` (`@osdlc/corpus-fitness-vocab`). Types: `exercises`, `movement-families`.

`exercises` (id the slug, for example `ab-wheel-rollout`):

| Field | Type | R/O | Notes |
| --- | --- | --- | --- |
| `family` | x-ref `movement-families` | R | The abstract movement the exercise is a variant of |
| `variation_of` | x-ref `exercises` | O | A variant of this one; 8 unresolved in the vault now |
| `progresses_to` | array of x-ref `exercises` | O | The next harder exercise (new). The reverse is a backlink |
| `activity_kind` | x-ref `vocab/activity-kinds` | R | The session kind it is usually done in. A squat is `strength-training`, a rowing erg is `rowing` |
| `measurement_profile` | x-ref `vocab/measurement-profiles` | R | See section 3 |
| `measurement_extra` | array of x-ref `vocab/dimensions` | O | |
| `muscles_primary`, `muscles_secondary`, `muscles_stabilizer` | arrays of x-ref `muscles/muscles` | R (primary at least 1 when `verified`) | The three roles, 568, 841 and 1,264 edges today. A muscle is in one role |
| `contributions` | object, muscle id to number 0..1 | O | The vault's `contribution`; every key must be in one of the three lists (builder test) |
| `primary_group` | x-ref `muscles/muscle-groups` | O | |
| `equipment` | x-ref `vocab/equipment` | R | The main one |
| `equipment_all` | array of x-ref `vocab/equipment` | O | |
| `modality` | array of x-ref `vocab/modalities` | O | |
| `movement_pattern` | x-ref `vocab/movement-patterns` | R | |
| `axes` | object | O | Coordinates on `variant-axes`; keys and values checked by a test |
| `competition_lift` | x-ref `vocab/competition-lifts` or null | O | |
| `bodyweight_factor` | number or null | O | Fraction of body mass carried, 0..1 and above for loaded bodyweight; 23 missing |
| `is_unilateral` | boolean | R | |
| `force` | enum `mixed`, `isometric`, `concentric`, `eccentric` | O | |
| `action` | enum `push`, `pull`, `hinge`, `squat`, `lunge`, `carry`, `brace`, `rotate`, `gait`, `jump` | O | The vault's list plus those for cardio and plyometrics |
| `category` | enum `compound`, `isolation` | O | |
| `utility` | enum `basic`, `auxiliary` | O | |
| `difficulty` | enum `beginner`, `intermediate`, `advanced` | O | |
| `norms` | object keyed by dimension id | O | `{typical, target}` in the dimension's unit |
| `default_tempo` | string | O | |
| `cues` | string[] | O | |
| `video` | uri | O | A link, never a copy |
| `conflicts` | string or null | O | |

`external_ids`: `free-exercise-db` (id such as `Ab_Roller`), `wger` (integer as string),
`google-health-connect` (segment type name where one fits, for example `BENCH_PRESS`),
`hevy-template` is not stored (ids are per account).
`movement-families`: `movement_pattern` (x-ref), `summary`. 34 today. Variants are backlinks.

**Variants and progressions.** Three relations, kept apart because they answer different questions:
`family` (what movement), `variation_of` (a change on one axis: grip, stance, implement), and
`progresses_to` (an order of difficulty, for example knee push-up to push-up to archer push-up).
`axes` gives the coordinates that make a variation specific, so the agent proposes a `variation_of`
only where exactly one axis differs. Isometric versions of dynamic exercises are separate exercises
with `variation_of` pointing at the dynamic one, which is what RESEARCH-PLAN already decides.

**Sources and licences.** Authored data CC BY 4.0 (the vault's own words and weights).
free-exercise-db is the Unlicense (84 matched, 792 unadopted). wger: data "Creative Commons (see
individual entries)", with per-record licences; names in other languages and videos stay out of this
package (they are the vault's 384 `Licensed Media` rows) and, if wanted, form a separate
`exercise-media` corpus with its own licence (open question 6). OpenPowerlifting: public domain. ExRx and
MuscleWiki: nothing copied.

**Already supplied.** 200 verified exercises with muscles, equipment, family, axes, profile,
cues; `research/exercises/shard-*.json`; free-exercise-db and wger import manifests in
`research/imports/` and the Python importers in `pipeline/`.
**Gaps.**

1. No exercise outside strength (see the list below). This is the work that proves the profile design.
2. 151 unresolved muscle references; 8 unresolved `variation_of`; 20 duplicates; 22 axis issues;
   23 missing `bodyweight_factor` (all from `research/gaps.json`).
3. `activity_kind` and `measurement_profile` are new fields; `progresses_to` is new.
4. 792 free-exercise-db rows not adopted. Adopting them as `imported` (confidence 0.4) needs a
   mapping from its 17 muscle names to groups and its `category` (`cardio`, `stretching`,
   `plyometrics` and so on) to a profile; `cardio` to `distance-duration` or `machine-cardio` by
   equipment, `stretching` to `duration-only`, `strength` and `powerlifting` and `olympic
   weightlifting` and `strongman` to `reps-load`, `plyometrics` to `reps-only`. Default only; a
   human reviews.
5. The importers are Python in sksizer/dev. #866 chose TypeScript for builders. The agent ports them
   to `src/build/` or leaves them and commits the outputs, and says which.

**New exercises the agent adds, at least one per profile that has none.** Examples, each verified to
the D-0020 floor: Running (outdoor), Treadmill Running, Walking, Hiking, Road Cycling, Stationary
Cycling, Rowing Machine, Ski Erg, Elliptical, Stair Climber, Swimming Freestyle, Jump Rope, Burpee,
Sled Push, Battle Ropes, Yoga Sun Salutation, Static Hamstring Stretch, an AMRAP circuit
exercise, a zone-2 effort. About 40 exercises. Muscles for a cardio exercise are required once
`verified`, as for a lift.

**Acceptance.**

1. `--strict` passes, with all `x-ref` fields resolving across the three corpora.
2. The 200 existing ids are unchanged, and each maps to a profile whose `shape` equals the old
   `shape_default` and whose `legacy_ids` contains the old `measure_profile` (a test).
3. Every `verified` exercise has at least one primary muscle, a profile, an activity kind, a
   `movement_pattern` and an `equipment`; counts per role equal 568, 841 and 1,264 minus any
   documented dedupe (the agent lists each loss).
4. Every profile in `fitness-vocab` is used by at least one verified exercise.
5. `contributions` keys are a subset of the three lists; `axes` keys and values exist in
   `variant-axes`; `norms` keys are dimensions of the profile or its extras.
6. No `variation_of` or `progresses_to` cycle; no exercise is its own variation.
7. The dashboard's 200 `exercise:<slug>` ids all exist (a test reads the pack).
8. No wger or other per-record licensed text is present: a test searches for the `Licensed Media`
   rows' strings.
9. `export/exercises.ndjson` exists with a `datapackage.json` naming each source's licence.

### 5. A performance log: input to a dashboard plan, not a corpus

The corpora define what can be measured. They do not hold anyone's workouts. This sketch shows how a
log follows the profiles, so the dashboard's later model can adopt it. It is borrowed from the
platforms' shape (a session, ordered segments inside it) and is only a proposal for that plan.

```json
{
  "type": "session",
  "activity_kind": "strength-training",
  "started_at": "2026-11-19T07:30:00Z",
  "ended_at": "2026-11-19T08:25:00Z",
  "equipment_class": null,
  "rpe": 7,
  "segments": [
    { "seq": 1, "kind": "active", "exercise": "back-squat",
      "values": { "reps": 5, "load": 100, "rpe": 7 } },
    { "seq": 2, "kind": "rest", "values": { "duration": 120 } },
    { "seq": 3, "kind": "active", "exercise": "plank",
      "values": { "duration": 60, "load": 10 } },
    { "seq": 4, "kind": "active", "block": "b1", "exercise": "rowing-machine",
      "values": { "distance": 500, "duration": 105, "heart-rate-avg": 162 } }
  ],
  "blocks": [{ "id": "b1", "kind": "intervals", "repeat": 8 }]
}
```

- A **session** has one activity kind and times. A **segment** has a `kind` (`active`, `rest`,
  `warmup`, `cooldown`, `pause`), an `exercise` (for `active` ones), a `side` when unilateral, and
  `values`, a map of dimension id to a number in the dimension's stored unit.
- A segment's value keys must be in its exercise's profile (required, optional) or its
  `measurement_extra`. The required ones must be present. A form shows the required, and offers
  the optional; an agent asks for exactly those.
- **Blocks** group segments: `straight`, `superset`, `circuit`, `emom`, `amrap`, `intervals`, with
  `repeat` or `rounds`. They are data, so a new format is a value, not a schema.
- **Totals** per dimension follow the dimension's `aggregation`. Volume for a lift is `reps x load`,
  for a hold `duration/30 x (body x factor + added load)` as the vault's RESEARCH-PLAN decides,
  computed, never stored.
- A **personal exercise** with no corpus profile gets `reps-load` by default and can pick another
  profile from the list. A corpus profile is a record, so the household may extend it as a local
  record in its own corpus.

**What it replaces in the dashboard.** `exercise.log_kind` (T-D7AU decision 8, unapproved) becomes
`exercise.measurement_profile`, the profile slug. It generalizes the four values:
`weight_reps` to `reps-load`, `reps` to `reps-only` or `reps-bodyweight`, `duration` to `hold` or
`duration-only`, `distance` to `distance-duration` or `carry`. The `set` document (with `reps`
required at least 1 and `weight_kg`) becomes a segment, and the separate `activity` document
(hike, jog, run ... with distance, duration, elevation) becomes a session with an activity kind
and, for GPS data, a route held outside the values. Existing sets migrate to segments with
`{reps, load}`; existing activities to a session with one `distance-duration` segment. A dashboard
plan decides all of this; none of it is done here.

### 6. `fitness-evidence`

**Purpose.** The research behind the model: each claim about a muscle, exercise or activity kind,
the document it came from and the words quoted. It lets a reader check a record, and lets the
model corpora stay small.

**Package** `@osdlc/corpus-fitness-evidence`. `extends` the claims profile
(`@osdlc/corpus-profile-claims`, prefix `claims`) and `references` `muscles`, `vocab`,
`exercises`. This is the direction the vault already has: an evidence record points at the model
record and names a field, so the dependency is acyclic with no model corpus pointing back.

Mapping from the vault:

| Vault | Records | Becomes |
| --- | --- | --- |
| `Sources/` (727 + 10), with `publisher`, `url`, `quality`, `retrieved_at`, `licence` | about 737 | `documents` (local type with `x-extends: claims/documents`, adding `publisher`, `quality`, `retrieved_at`, `licence`) |
| `Evidence/` (2,736), each `subject`, `subject_kind`, `field`, `claim`, `quote`, `source` | 2,736 | one `study-results` (the quote and where it was read, `reportedIn` the document, with `excerpt`) |
| The claims grouped by (subject, field) | about 1,700 *to count* | one `statements`: `proposition` subject `<corpus>/<type>/<id>`, predicate `field:<name>`, object the claimed value; `direction`; evidence lines linking the study results |
| The record's `conflicts` | | a `statements` with `direction: disputes` and its own lines |
| The vault's evidence floor (D-0020) | | a check in the builder: a `verified` model record has at least two documents from two publishers, one not Wikipedia |

Evidence by subject: exercise 1,051, muscle 803, food 300, activity kind 253, nutrient 178,
measure kind 159. **Foods and nutrients (478) go with #866's corpora, health measures (159 plus
panels 7) are out of scope**, so about 2,100 stay in this corpus. The `quote` is a short extract
from a third-party page; its copyright and the document's licence are the open point of open question 2.
The claims profile's `contributions` is required: the importer is the contributor, `software`, with
the date.

**Answers to task 85's questions, for the model half.**

1. *Can the research half be a claims corpus that the model corpus names in `references`?* Yes,
   with the direction reversed: the claims corpus references the model, since an evidence record
   already points at the model record. The model needs no `references` on the claims. Whether
   they ship together is Q4.
2. *How does a model record point at the evidence for one of its fields?* It does not. The
   evidence points at the record and field; the model's evidence is a backlink query
   (`corpus-query`), and the model's `sources` and `confidence` summarize it. `x-ref` covers
   evidence to model only for the subject's id, with gap 2 above.
3. *What does the vault have that corpus-schema cannot check?* The four gaps listed above, plus
   generated blocks (a group's member list) which become backlinks and need nothing, and
   `research_status: verified` meeting the floor, which is a builder test.
4. *Generator or converter?* A one-time import by the fulfilling agent, reading the vault and
   `research/`; after it, osdlc is the source of truth and the vault in sksizer/dev is frozen or
   read from the packages (Q7). The importers (free-exercise-db, wger, OpenPowerlifting) move to
   each corpus's `src/build/`, per #866's standard.

**Acceptance.** `--strict` passes with the claims profile extended; each statement has at least one
evidence line; each document has a URL or DOI; every subject string resolves (builder test); about
2,100 study results, with the exact count recorded from the import; the evidence floor check passes
for every `verified` model record.

### 7. Nutrients and foods

Defer to #866 (tasks 89 to 96): `food-nutrients` and `usda-fdc`. Relations only.

- The vault's 68 `Nutrients/` and 300 `Foods/` are the seed #866 already names. This plan adds no
  type for them. Task 85's overlap note stands: the vault's foods reference `usda-fdc` by id.
- The vault's 300 foods each carry an `fdc_id`; after #866's phase 4 the agent checks each one
  exists in `usda-fdc` and records those that do not.
- Evidence about foods (300) and nutrients (178) belongs with them, in whatever evidence corpus
  #866 or a later plan makes; this plan's `fitness-evidence` takes none of it.
- An exercise's calories (MET) live on the activity kind, not a nutrient; they do not overlap.
- Health measures and panels (`Measures/`, `Panels/`, 102 records, LOINC-keyed) are neither fitness
  models nor food; leave them in the vault until their own plan (open question 8).

## Sources and licences

| Dataset | Content | Licence, as read |
| --- | --- | --- |
| Authored vault content (weights, roles, cues, families, axes, claims) | Ours | CC BY 4.0 by the vault's `LICENSE.md`. sksizer/dev is private; open question 2 |
| free-exercise-db | 876 rows, 84 matched | Unlicense ([repo](https://github.com/yuhonas/free-exercise-db)); the licence file text was not read, so confirm |
| wger | 949 rows, 80 matched, 384 licensed names and videos | Data "Creative Commons (see individual entries)", per record ([README](https://raw.githubusercontent.com/wger-project/wger/master/README.md)); keep out of the model packages |
| OpenPowerlifting | equipment classes, competition lifts | Public domain (snippet; confirm the repo's `LICENSE-DATA`) |
| Imported muscle text | 158 muscles at 0.4 | Provenance unstated in `Attributions.md`; sources are Wikipedia (CC BY-SA, *to confirm*) |
| FMA, Uberon | ids only | CC BY 4.0 or 3.0, and 3.0, *per Bioregistry, not a primary file* |
| Compendium of Physical Activities | 81 MET values | Free to use, cite, do not alter values; licence *not confirmed* |
| UCUM | unit strings | Terms not read |
| ExRx, MuscleWiki | | Not reusable. Never copied |
| Hevy, Strong, FitNotes | design reference only | Nothing copied |

The package data licence is stated per package in `package.json` and `DATA-LICENSE.md`, as #866
does: `(MIT OR Apache-2.0)` for code, and the data's own licence beside it. Whether our data goes
out as CC BY 4.0 or as `MIT OR Apache-2.0` like `food-nutrients` is open question 2.

## Order of fulfilment

Nothing starts before the owner reviews this plan (task 97 is the review). The tasks, each one pull
request unless noted:

| Order | Task | Delivers | Waits on |
| --- | --- | --- | --- |
| 0 | 90 (#866) | `S-corpus-package-shape` and the `corpora` check | Already filed |
| 1a | 98 Muscles corpus | `muscles`, ids mapped, `--strict`, export | 90, open question 2 |
| 1b | 99 Fitness vocab corpus | plain lists, dimensions, profiles, activity kinds | 90; independent of 1a |
| 2 | 100 Exercises corpus | the 200 migrated, about 40 added, profiles used | 98, 99 |
| 2b | 100 continued | free-exercise-db and wger adoption as `imported` | 2; optional |
| 3 | 101 Fitness evidence corpus | claims for the above | 100 |
| 4 | 102 Fitness corpora consumers | dashboard pack tool and a performance-log plan in sksizer/dev; determined later | 99 (profiles) at least; 100 for exercises |

Reasons: muscles and vocab are leaves and can run in parallel; profiles must exist before the
exercises can name them, and exercises is where the design is proved (an exercise per profile);
evidence last because it refers to everything and is optional.

## Briefs

Each brief is meant to be handed to a fulfilling agent as written. All briefs also say: read this
plan and #866's plan and `S-corpus-package-shape` first; work in a worktree; change no corpus-schema
spec, validator, query or site code (list a needed change as a proposed gap); search
`packages/ts` and the sksizer/dev packages before writing a helper; commit and push each step; open
a draft PR; make no model calls from the builder; do not publish.

**Brief 98, `muscles`.**

> Create `packages/corpora/muscles` (`@osdlc/corpus-muscles`), following `S-corpus-package-shape`.
> Types `muscles`, `muscle-groups`, `body-regions`, schemas as in docs/planning/fitness-corpora.md
> section 1. Read sksizer/dev `packages/vaults/fitness` at origin/main: `vault/Muscles/` (254),
> `vault/Muscle Groups/` (37), `research/muscles/`. One record per file, named by slug, `formats: [md]`.
> Drop the six `movement` groups (move them into your report for task 99). Resolve the 151 exercise
> references that do not match a muscle by adding `aka`; write the mapping to `fixtures/`. Add
> `external_ids` (`fma`, `uberon`, `wikidata`, `wger`, `free-exercise-db`) by Latin-name match,
> citing Bioregistry and each ontology's own files for the licence and id formats; never copy labels
> or a TA2 table. Do not copy images. Do not publish: Open question 2 must be settled first. Pass the
> acceptance checks of section 1 and report the numbers.

**Brief 99, `fitness-vocab`.**

> Create `packages/corpora/fitness-vocab` (`@osdlc/corpus-fitness-vocab`). Types: `equipment`,
> `equipment-classes`, `competition-lifts`, `movement-patterns`, `modalities`, `variant-axes`,
> `dimensions`, `measurement-profiles`, `activity-kinds`. Specs: sections 2 and 3 of
> docs/planning/fitness-corpora.md. Bring over the vault's `Equipment`, `Equipment Classes`,
> `Competition Lifts`, `Movement Patterns`, `Modalities`, `Variant Axes` and `Activity Kinds`.
> Author `dimensions` (about 28) and `measurement-profiles` (the 14 in the plan) from scratch, with
> UCUM codes. Add about 15 cardio equipment records and `locomotion` and `jump` patterns. Add
> `default_profile` to every activity kind and record the choice; add Health Connect names by
> reading developer.android.com and cite the page. Check the Compendium terms before copying a MET
> value; keep its code. Pass the acceptance checks of section 3.

**Brief 100, `exercises`.**

> Create `packages/corpora/exercises` (`@osdlc/corpus-exercises`) referencing `muscles` and
> `fitness-vocab`. Types `exercises`, `movement-families`; spec in section 4 of
> docs/planning/fitness-corpora.md. Bring over the 200 verified exercises and 34 families from the
> vault (`Exercises/`, `Movement Families/`, `research/exercises/`). Keep slugs as ids.
> Convert `muscles[]` into the three role arrays and `contributions`. Convert `measure_profile`
> and `shape_default` into `measurement_profile` through the `legacy_ids`, and assert each
> exercise keeps its shape. Fix what `research/gaps.json` reports. Add about 40 verified
> non-strength exercises so every profile has one, to the D-0020 floor, with sources. Do not copy
> wger names, translations or videos. If the importers are ported, port them to `src/build/`
> in TypeScript. Pass the acceptance checks of section 4. Adopting the 792 free-exercise-db rows is a
> second PR.

**Brief 101, `fitness-evidence`.**

> Create `packages/corpora/fitness-evidence` extending `@osdlc/corpus-profile-claims`, referencing
> the three model corpora. Read `packages/profiles/claims` and `packages/corpora/harness-reference`
> first. Convert the vault's `Sources/` and `Evidence/` for muscle, exercise and activity-kind
> subjects only, as the table in section 6 of docs/planning/fitness-corpora.md, writing the
> `contributions` field as software. Write the evidence-floor check as a builder test. Answer
> task 85's four questions in the PR from what you found, correcting this plan where it is wrong.
> Do not convert food, nutrient or measure evidence.

**Brief 102, consumers.**

> In sksizer/dev, plan only (no build): how the dashboard's pack tool reads the corpora's
> `export/` and how its exercise, set, workout and activity documents adopt `measurement_profile`
> and the session and segment shape in section 5 of docs/planning/fitness-corpora.md. Cover the
> migration of existing sets and activities, `log_kind`'s replacement, and what determined takes.

## Risks

- **Licence.** Section "Sources and licences": three items are unconfirmed and block publishing.
- **Scope creep of profiles.** Fourteen profiles and 28 dimensions may be too many or too few; the
  acceptance rule (each used by a verified exercise) keeps unused ones out.
- **A spec gap the workaround hides.** The role arrays lose nothing now but make `contributions` a
  separately-checked map; nested `x-ref` (task 31) is the clean fix.
- **Collision with #866.** Both branches add tasks to the milestone and a note to task 85, and both
  regenerate `tools/explorer/data/plan.json`. This branch numbers its tasks from 97 for that reason.
  Whichever lands second rebases and regenerates `plan.json`.
- **Counts that are estimates.** "About 1,700 statements", "about 40 new exercises" and "about 28
  dimensions" are estimates from the vault's counts; the agent records the real ones.
- **Survey gaps.** Hevy, Strong, FitNotes, Garmin enums and Open mHealth schema files were not read
  from primary pages. The design does not depend on any of them, but the agent must not cite them
  as confirmed.

## Open questions for the owner

Each has a recommendation; the plan assumes the recommendation unless the owner says otherwise.

1. **Where does "determined fitness" live?** The brief says it was tried on SQLite and found limiting
   early. Searching this machine and GitHub did not find a repository by that name. The only trace
   is `solutions/determined/crates/determined-fitness` in sksizer/dev (a Rust crate that compiles
   the vault into SQLite at build time, as T-C5RP and #866 describe). *Recommend:* take that crate
   to be it, and ask the owner to name the repository and the specific limits hit (schema changes?
   many-to-many muscle edges? profiles as enums?), since those limits should become acceptance
   checks. Until then the plan assumes the limit was a closed schema, which the profile records
   answer.
2. **Licence of public content.** sksizer/dev is private. The vault's own content is CC BY 4.0;
   imported muscle text is sourced from Wikipedia; wger rows are per-record CC; the evidence
   quotes are third-party extracts. *Recommend:* before anything is published, the owner confirms
   (a) CC BY 4.0 or `MIT OR Apache-2.0` for the model data (the latter for consistency with
   `food-nutrients`), (b) where the 158 imported muscles' text came from and whether CC BY-SA
   applies, (c) whether evidence `quote` fields ship at all or only locators. The agent does 98 only
   after (b).
3. **One corpus or several?** *Recommend* three model packages plus evidence, as design question 1; fallback
   `muscles` plus one `fitness` corpus.
4. **Does evidence ship with the model?** *Recommend* no: a separate optional package, since the model
   records already carry `sources`, `confidence` and `conflicts`, and an app that wants only data
   should not download 2,100 quotes. An app that wants to show "why" installs the evidence package.
5. **Measurement profiles as records or as an enum?** *Recommend* records, as here; an enum in the
   schema would put the design back where the SQLite attempt may have hit its limit. The cost is 28
   plus 14 small records and the cross-corpus checks.
6. **Where do wger's licensed names and videos go?** *Recommend* out of the model packages
   (as the vault does with `Licensed Media`), and a later `exercise-media` corpus with its own
   licence only if the owner wants translations.
7. **Does osdlc become the source of truth, with the vault frozen?** *Recommend* yes after the
   import: osdlc owns the corpora, the importers move with them, and sksizer/dev's pack tool and
   determined read the packages. Otherwise two copies drift.
8. **Health measures and panels** (102 records, LOINC-keyed): *recommend* a separate later plan,
   `health-measures`, not part of this one. Nothing here blocks it.
9. **Training programs.** `research/programs/` in the vault holds program research (Starting
   Strength and others) with no vault folder yet. *Recommend* not in this plan; a later corpus
   `training-programs` that references `exercises` once the model is in.
10. **Package names and the milestone.** *Recommend* the four names above in `m-model-layer`, with task
    numbers from 97. Rename if the owner wants `fitness-muscles` instead of `muscles` (the shorter
    name is general, an anatomy corpus not tied to fitness).

## Where this plan stands

Not started. Everything above is from files read at `origin/main` of osdlc and sksizer/dev and from
the pages cited, on 2026-11-19. No data was copied, no corpus was built, and no spec, validator,
query or site file was touched. Pull request for review.
