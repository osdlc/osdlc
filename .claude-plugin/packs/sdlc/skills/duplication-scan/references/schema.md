# Duplication scan — schemas, checklist, rubric, convergence

Reference material for the duplication-scan skill. Every role reads the part it
needs; the orchestrator holds the whole.

## Charter

Every delegation passes exactly this block:

```yaml
charter_id:        <parent_id>.<n>          # R1.2, A1.2.3, AR2 …
role:              cartographer | prospector | adversary | arbiter | specialist
scope:             <explicit dirs / languages / finding ids — never "the whole repo">
question:          <the single question this agent answers>
depth_remaining:   <parent's depth_remaining - 1>   # 0 => may not delegate
fanout_remaining:  <at most 6>
must_return:       <schema below>
budget_hint:       <tool calls / wall clock>
```

Split by natural seam (product, package, language, layer), not by file count.
A child returns structured findings and evidence only. A parent spot-checks at
least one cited range per child finding before forwarding it.

## Finding

Findings live in `<WORKDIR>/ledger.json` and persist across rounds. A finding is
never deleted; its `status` changes.

```yaml
id:              <charter_id>-F<nn>          # e.g. R1.2-F03; merge-findings rewrites
                                             # it to the stable ledger id F-nnnn
title:           <one line>
type:            exact_clone | renamed_clone | gapped_clone | semantic_clone |
                 parallel_implementation | duplicated_contract | duplicated_config |
                 duplicated_infra | misplaced_module | over_broad_package |
                 wrong_dependency_direction
sites:           [{path, lines, sha, product, package}]   # >= 2
similarity:      {method: token | ast | behavioral | manual, score: 0.0-1.0}
divergence:      <how the copies differ today, concretely, with line refs>
evidence:
  co_change:     <n of m commits touched >1 site; list shas or 'none'>
  drift:         <commits where one site changed and siblings did not>
  defect_echo:   <a bug fixed in one copy and not the others — commit or issue>
  churn:         <commits per site over the history window>
proposal:
  action:        extract_package | merge_into_existing | move | split_package |
                 invert_dependency | leave_as_is
  target:        <new or existing package — a CONCEPT name>
  api_surface:   <the exact public API — types, functions, events>
  consumers:     [<packages/products that would depend on it>]
  dep_direction: <asserted edges; must not create a cycle>
  variation:     <params, strategy, hooks, or 'none needed'>
cost:
  migration:     <countable: call sites, tests, build config, CI>
  blast_radius:  <products affected; release coupling introduced>
  ownership:     <who owns the new package — a team, or a subtree/planning unit>
  reversibility: <easy | moderate | hard, and why>
confidence:      0.0-1.0     # <= 0.4 when no empirical test passes
status:          proposed | contested | accepted | rejected | deferred
verdict_notes:   <Arbiter, appended per round>
round_first_seen: <n>
round_last_changed: <n>
# Written by the ledger, never by a Prospector:
round_last_amended: <n>      # last round evidence_for_existing amended it
round_evidence:  [{round, charter, key, evidence}]   # one per evidence_for_existing entry
merged_from:     [<the folded secondary findings>]
verdict_history: [{round, from, to, notes, rank_inputs}]
```

## Objection

```yaml
id:              <charter_id>-O<nn>          # e.g. A1.2-O01; merge-objections rewrites
                                             # it to the stable ledger id O-nnnn
against:         F-0001
class:           <checklist number and name>
claim:           <what is wrong>
evidence:        <path:lines | commit | command with output — required>
severity:        fatal | material | minor
disposition:     sustained | overruled | unresolved   # set by the Arbiter
```

Severity: `fatal` — the finding cannot be accepted as stated; `material` — the
proposal must change; `minor` — wording or precision.

## Empirical tests (Prospector runs them before writing a finding)

- **Co-change** — `git log --format=%H --name-only -- <siteA> <siteB>`; count
  commits touching more than one site. Follow renames (`--follow`, or map old
  paths) when the tree has moved. High co-change is the strongest argument for
  extraction.
- **Drift** — sites changing independently and in different directions: a
  strong argument against; they are separate concepts that look alike.
- **Defect-echo** — a bug fixed in one site and left in the others
  (`git log -S`, `git log --grep=fix`): the concrete cost of the duplication.
- **Stability** — commits per site; volatile shared code imposes release
  coupling.

## Adversary checklist

Run every item against every `proposed` and `contested` finding; report the
ones that bite, with evidence.

Factual:

1. Cited line ranges do not contain what the finding claims.
2. Similarity is superficial — same shape, different semantics (error handling,
   null behaviour, precision, timezone, locale, rounding, concurrency).
3. A copy is generated, vendored, a fixture, or dead — verify reachability.
4. Copies target different runtimes, framework versions, or platforms.
5. Copies are load-bearing on different SLAs, security boundaries, or tenancy.
6. Counts, churn, or call-site numbers are unreproducible.

Design:

7. Wrong abstraction — unifying needs flags; the API is a union of two APIs.
8. Premature — fewer than three real consumers, or the third is speculative.
9. Coincidental cohesion — grouped by similarity, not by reason to change.
10. God-package growth — the target is already an unfocused bucket.
11. Cycle or inversion — the edge creates a cycle or points from a stable layer
    to a volatile one.
12. Contract not behaviour — the real fix is a shared schema, not shared code.

Organizational and operational:

13. Release coupling — independently-deployed products now share a version;
    name who is blocked by a breaking change (include any publish channel).
14. Ownership vacuum — no team or subtree plausibly owns it.
15. Hyrum's law — consumers depend on incidental behaviour of one copy.
16. Build/CI impact — fan-out, cache invalidation, path filters, CI time.
17. Migration realism — the count omits tests, mocks, generated clients,
    mirrors, or downstream repositories.
18. Sequencing — the proposal depends on a proposal not yet accepted, or on an
    open decision.

Meta:

19. Objection quality — is this objection itself evidence-backed and
    falsifiable?

The Adversary also attacks the reasoning: does the conclusion follow from the
cited evidence; is similarity inferred from names or layout; is any number
stated without a reproducing command; is cost specified at the same fidelity as
benefit; is an assumption smuggled in (products stay aligned, one owner, a
stable API)?

## Arbiter rubric

**Accept** requires all of: at least `MIN_COPIES` sites, or two sites with a
documented defect-echo or contract-divergence risk; passing co-change evidence,
or sites that encode a shared contract rather than shared behaviour; a concrete
API surface; no cycle introduced and no inversion left unresolved; migration
cost in countable units; a named owner; every fatal and material objection
overruled with evidence, or sustained and absorbed as a mechanical amendment the
objection itself names.

**Reject** if any of: sites coincidentally similar; diverging by design; the
abstraction needs more than two configuration knobs; extraction couples
independently-released products without compensating benefit; the code is
volatile; the shared code would be owned by no one; a fatal objection is
sustained; the finding restates settled ground (record the owning id).

**Contested** when both sides hold evidence-backed positions and neither is
refuted; record both cases verbatim. A legitimate terminal state.

**Defer** when resolution needs information not in the repository; state the
exact question a human must answer.

Objection dispositions: `sustained`, `overruled` (cite what refutes it),
`unresolved` (a fatal or material one makes the finding `contested`). Strike any
objection or claim without a citation.

`rank_inputs` per finding: `benefit` 1–5 (defect-echo or contract risk high),
`confidence` 0–1 after objections, `cost` 1–5 (countable migration units).
Ranking uses benefit × confidence ÷ cost.

## Convergence

A round is **quiet** when all hold: no new finding above confidence 0.5; no
finding changed status; no new fatal or material objection; every finding is
`accepted`, `rejected`, `contested`, or `deferred`; and the Adversary has
explicitly reported that it attempted and failed to falsify each `accepted`
finding in its final form, naming what it tried. Exit after
`STABLE_ROUNDS_TO_EXIT` consecutive quiet rounds (default 2). A finding amended
without a status change — evidence or sites attached through
`evidence_for_existing` — needs a fresh report: `sdlc duplication-scan
merge-findings` moves its `round_last_amended`, and the
checklist compares the report against that as well as `round_last_changed`.

Continue while any objection is unresolved, any verdict changed in the last
round, any listed product, package, or language has no Prospector coverage, or
the last Adversary pass sustained fatal or material objections on more than a
third of proposals (tighten the Prospector's threshold and rerun).

Loop hygiene: two consecutive rounds producing identical objections with no new
evidence make the point `contested`; stop arguing it. On `MAX_ROUNDS`, stop and
report every non-terminal finding with what would settle it.
