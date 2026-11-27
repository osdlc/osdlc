---
title: How pr-update runs
description: One run of pr-update update --apply followed through the code, where each thing lives, and the known problems.
---

pr-update brings open pull requests up to date with their base branch. For
each PR it rebases or merges, runs the verify command, optionally lets a repair
agent fix what broke, and pushes. This page follows `pr-update update --apply`
through the calls the code makes. It was mapped from the source at
`f5456df2`, not from the other docs; where the two disagreed, the code won and
the disagreement is listed under [Known problems](#known-problems). Its line
references were brought up to date at the end of S12 (`38977714`).

File and line references are relative to `src/`.

## One run, start to finish

```mermaid
flowchart TD
  start(["pr-update update --apply"]) --> chk["Command-line checks<br/>umask · GIT_DIR refusal · --branch · flags"]
  chk -->|bad usage| x2(["exit 2"])
  chk --> cfg["Load pr-update.yaml + .local"]
  cfg -->|invalid| x14(["exit 14"])
  cfg --> rt{"Project config names commands:<br/>is this checkout trusted?"}
  rt -->|no| x21(["exit 21"])
  rt -->|yes| pre["Preflight<br/>git · gh or curl · the remote"]
  pre -->|tool missing| x22(["exit 22–25"])
  pre --> tg["Resolve targets<br/>this checkout + each --repo"]
  tg --> loc{"--repo: checkout<br/>on this machine?"}
  loc -->|yes| yours["Use that checkout"]
  loc -->|no| ok{"Clones allowed?<br/>machine file or first-run question"}
  ok -->|no| none["Skipped: no checkout"]
  ok -->|yes| clone["Lock and make a bare clone<br/>gh repo clone · fetch"]
  yours --> sv
  tg -->|this checkout| sv
  clone --> sv["Survey<br/>list open PRs · fetch · measure drift · pick rebase, merge or skip"]
  sv --> sel["Select PRs<br/>--pr · drafts · blocked stacks · failed-attempt limit"]
  sel --> tt{"--repo target trusted<br/>to run commands?"}
  tt -->|no| unt["Its PRs skipped: untrusted"]
  tt -->|yes| kept["Settle kept trees<br/>--discard-kept · stale ones go · current ones skip the PR"]
  kept --> wt["Per repository: remove killed runs' scratch worktrees<br/>(not locked ones) · one run worktree at the base"]
  wt --> loop[["Per PR: next chart"]]
  loop --> rm["Remove the run worktree<br/>and scratch branch"]
  rm --> br["--branch: move the checkout<br/>to the pushed head, if nothing is lost"]
  br --> ap["Automatic prune<br/>when the run used the cache · locked worktrees stay"]
  ap --> done(["Report · exit 0, or 1 if any PR failed or conflicted"])
```

Without `--apply` the run goes through the same steps but pushes nothing,
keeps nothing and records nothing. It still fetches, takes clone locks, makes
worktrees, scratch branches and commits, and runs resolvers and verify. It
calls no repair and turns git's rerere off, even where the repository's config
turns it on, so it neither replays nor records a resolution.

| Step | Where |
| --- | --- |
| Command-line checks | `cli.ts:161-179`, `preflight.ts:110-122`, `commands.ts:187-201`, `680-689` |
| Project config | `commands.ts:204-216`, `config-file.ts:46-72` |
| Project-root trust gate | `commands.ts:691-713`, `trust.ts:62-142` |
| Preflight | `commands.ts:399-414`, `preflight.ts:61-85` |
| Resolve targets, find checkouts | `survey.ts:671-737`, `992-1024`, `locate.ts:84-166` |
| Managed clones | `mirror.ts:773-1184` (`provide` `1037-1113`, `makeClone` `504-580`) |
| Survey | `survey.ts:1044-1257`, `strategy.ts:107-164` |
| Select PRs | `update.ts:166-286` |
| Per-target trust gate | `update.ts:720-731`, `trust.ts:151-203` |
| Settle kept trees | `update.ts:1143-1268`, `update/kept.ts` |
| Run worktree per repository | `update/execute.ts:1333-1385`; killed runs' scratch worktrees `1485-1502`, locked ones skipped with `lockedByPerson` (`update/registrations.ts:57`) |
| Cleanup of the run worktree | `update/execute.ts:1463-1475`, `update/registrations.ts` (`ownedUnder` `69`, which leaves a locked worktree, or one whose lock or record cannot be read) |
| `--branch` sync | `update.ts:512-534`, `872-884` |
| Automatic prune | `commands.ts:359-393`, `prune.ts:724-1252` |
| Report and exit code | `commands.ts:431-441`, `531-556`, `779-808` |

## Each pull request

```mermaid
flowchart TD
  lease["Take the branch lease<br/>git-ref attempt store only"] -->|another run has it| s1(["skipped"])
  lease --> co["Check out the PR head<br/>on a scratch branch"]
  co -->|head moved since the survey| f(["failed"])
  co --> bh{"Behind its base?"}
  bh -->|no| up(["up to date"])
  bh -->|yes| st{"Strategy"}
  st -->|rebase| rb["Rebase, one stop at a time<br/>rerere (--apply) · lockfile · resolvers · generators · repair agent<br/>a rejected repair or abandoned rebase removes its resolutions"]
  rb -->|stuck, fallback set| mg
  rb -->|stuck| cf(["conflict"])
  st -->|merge| mg["Merge the base in<br/>same resolvers · commit"]
  mg -->|unresolved| cf
  rb -->|done| v
  mg --> v["Run verify"]
  v -->|passes| push["Push<br/>rebase: --force-with-lease · merge: plain"]
  v -->|fails| rp{"Repair on<br/>verify-failed?"}
  rp -->|no or rejected| f
  rp -->|repaired| v2["Commit the repair,<br/>verify again"]
  v2 -->|fails| f
  v2 -->|passes| push
  push -->|branch moved on the remote| f
  push --> upd(["updated"])
  f --> drop["--apply: remove the resolutions<br/>rerere recorded for this PR"]
  cf --> drop
  drop --> keep["keep_failed: keep the tree<br/>on pr-update/failed-* for a person"]
  upd --> rec["Record the attempt<br/>release the lease"]
  up --> rec
  keep --> rec
```

A repair is accepted only if it did not move HEAD, create refs, give up, leave
conflict markers, or leave whitespace errors (`update/execute.ts:1212-1268`).

In `--apply`, unless `pr_update.rerere` is false, the rebase, the merge and
their `--continue` and commit run with git's rerere on and `autoUpdate` set
(`integrationEnv`, `update/execute.ts:1074-1085`). A conflict git has a
recorded resolution for is replayed and staged, so no resolver or repair sees
it; verify still runs. At each conflict the run notes, from its worktree's
`MERGE_RR`, the variant of the conflict its resolution goes to and whether that
variant was already resolved (`rerereTracked`, `1106-1129`). When a repair is
rejected, a rebase is abandoned after continuing past a resolved stop, or the
PR is not pushed (failed, conflicted, declined by the person, or a throw), that
variant's new resolution is removed (`dropNewResolutions`, `1142-1146`; called
at `605`, `1226`, `1230`, `536` and `540`). So only a PR that is pushed leaves
a resolution for the next one. A resolution the person records for the same
conflict in their own checkout meanwhile is another variant, and stays.

A failed attempt is recorded against the PR's head and base, so a PR that keeps
failing on the same commits is skipped next time unless `--retry-failed` is
given.

| Step | Where |
| --- | --- |
| Lease | `update/execute.ts:1387-1416`, `update/lease.ts` |
| Checkout and quick exits | `update/execute.ts:405-544` |
| Rebase through the resolvers | `update/execute.ts:581-696`, `update/resolvers.ts:105-134` |
| Merge | `update/execute.ts:714-826` |
| Rerere on, tracked, dropped | `update/execute.ts:1074-1146`, `536-540` |
| Verify and repair | `update/execute.ts:828-857`, `1000-1021`, `1212-1280`, `repair/` |
| Push | `update/execute.ts:859-951` |
| Keep a failed tree, record the attempt | `update/execute.ts:1423-1457`, `update/kept.ts:508-625`, `update.ts:838-848` |

## `survey` and `mirror`

`survey` runs the same target resolution and survey as `update`, with no trust
gate (it runs no project command) and no clone made. A clone it reads is locked
only for that read, without waiting; a busy clone is read without a fetch
(`mirror.ts:1115-1159`).

`mirror list` walks the clone folder and the run worktrees and changes
nothing. `mirror prune` removes dead run worktrees, leftover folders, and clones
past their age, with `--discard-kept` their kept trees too. Every removal first
passes one check: the owning clone lists it, its folder is safe, and the
clone's lock is held. A worktree the clone's list shows as locked
(`git worktree lock`, any reason but git's own `initializing`) stays, even
when its folder is missing, and so does its clone (`lockedReason`,
`prune.ts:420`; read from the clone's list at `1063`). A clone also stays while
its `worktrees/` folder holds a record its list does not show, or a kept
worktree's record names it though its list does not show the tree. A machine
file that cannot be read or is not valid removes no clone for its age.
Anything that cannot be read stays and is reported. `--dry-run` decides the
same way and reads the clone's lock as a claim would, without taking it. The
automatic prune at the end of `update --apply` is `mirror prune` with no flags.

## Where each thing lives

Paths are the macOS and Linux defaults with no variable set.

| Thing | Where | Lasts |
| --- | --- | --- |
| Project config | `<checkout>/pr-update.yaml`, `pr-update.local.yaml` | the person's |
| Machine file (clone consent, clone folder, maximum age) | `~/.config/osdlc/pr-update/config.yaml` | the person's |
| Checkout search roots | `~/.config/osdlc/repositories.yaml` | the person's |
| Trust grants | `~/.local/state/osdlc/pr-update/trusted/` | until revoked |
| Managed clones | `~/.cache/osdlc/pr-update/repos/<host>/<owner>/<name>.git` | until pruned |
| Run worktrees | the project root: `.pr-update/<pid>.<ms>`; other targets: `~/.cache/osdlc/pr-update/worktrees/<host>/<owner>/<name>/` | the run |
| Kept trees | the project root: `.pr-update/failed/`; other targets: `~/.local/state/osdlc/pr-update/kept/<host>/<owner>/<name>/` | until discarded, retried, or the PR moves |
| Attempt records | `.pr-update/attempts/`, `~/.local/state/osdlc/pr-update/attempts/<host>/<owner>/<name>/`, or refs on the remote | until the PR succeeds, or 30 days |
| Branch lease | `refs/pr-update/lock/<head>` on the remote (git-ref store only) | one PR |
| Recorded resolutions (rerere) | `rr-cache/` in the repository's common git directory: the person's checkout, or the clone | until git's `gc` expires them (60 days by default) |

## Modules

Lines at the end of S12 (`38977714`), against `main` at `88112cb4`, which does
not have the clone-cache work. In total `src/` went from 6,583 lines to
12,535. Files not listed (`detect.ts`, `devlink.ts`, `real-path.ts`,
`repair/names.ts`, `update/confirm.ts`, `version.generated.ts`) are small
helpers.

| Area | File | Lines (on `main`) | Job |
| --- | --- | --- | --- |
| Entry | `bin.ts`, `cli.ts` | 21, 179 (127) | process entry, signal forwarding, command tree, umask |
| Commands | `commands.ts` | 812 (598) | `survey` and `update` commands, flags, the run environment, report, automatic prune, exit code |
| Config | `config.ts`, `config-file.ts`, `config-cli.ts` | 336 (330), 72, 361 | the `pr_update` schema, layered loading, `config` commands |
| Preflight | `preflight.ts` | 122 (83) | tool and remote checks, the `GIT_DIR` refusal |
| Survey | `survey.ts`, `strategy.ts`, `code-host.ts` | 1,337 (896), 164, 87 (44) | targets, PR listing, fetch, drift, stack order, strategy |
| Update | `update.ts` | 1,370 (843) | the run: selection, grouping, trust, verify lists, kept trees, attempt routing, output |
| Executor | `update/execute.ts`, `update/resolvers.ts` | 1,519 (1,213), 154 (151) | per-repository worktree loop, per-PR rebase, merge, verify, repair, push; also the target git environment and rerere |
| Records | `update/attempts.ts`, `update/ref-attempts.ts`, `update/lease.ts` | 118 (117), 153 (150), 118 (115) | attempt stores and the branch lease |
| Kept trees | `update/kept.ts`, `update/registrations.ts` | 653 (204), 172 (new) | kept-tree records, checks, keep and discard; how a worktree is forgotten; what counts as a person's `git worktree lock` |
| Repair | `repair/agents.ts`, `repair/seat.ts`, `repair/prompt.ts` | 155 (152), 97 (89), 58 | headless agent, interactive and tmux repair, the prompt |
| Ports | `ports.ts`, `defaults.ts`, `index.ts` | 271 (179), 268 (158), 162 (153) | the `Ports` contract, the standalone ports, library exports |
| Targets | `locate.ts`, `trust.ts`, `machine.ts` | 192 (new), 203 (127), 168 (new) | finding a checkout, trust gates, the machine file and directories |
| Clones | `mirror.ts`, `mirror-cli.ts`, `clone-maintenance.ts` | 1,184, 309, 44 (all new) | consent, locks, making and checking clones, `mirror` commands |
| Cleanup | `prune.ts`, `folders.ts` | 1,267, 209 (both new) | `mirror list` and `mirror prune`, the folder rule |

The largest functions are `pruneMirror` (529 lines), `managedClones` (412),
`updateRun` (295), `updateCommand` (249) and `surveyWithTargets` (214). There
are no import cycles.

## Known problems

Items 1–19 were found while mapping the flow at `f5456df2`; 20–25 in the
final check of S12. The open items give lines at `38977714`; the fixed ones
keep the lines at `f5456df2`, where the problem was. Those marked fixed were
fixed in S12, in the commit named.

### Behaviour

1. One repository can stop the whole run. `releaseStaleScratch` and
   `git worktree add` sit outside `updateAll`'s `try`
   (`update/execute.ts:1378-1383`), and `updateRun` does not catch around
   `updateAll`. A missing base ref in one repository skips every later one,
   though the executor's design note says one stuck PR must not end the run.
2. A `--repo` target is cloned and fetched before its trust gate runs
   (`update.ts:624-626` against `720-731`), so an untrusted target costs a full
   clone that the run then skips.
3. Signal forwarding is installed only when `update` is the first argument
   (`bin.ts:19`). With a leading flag, such as `--output json update`, an
   agent started by the run gets no forwarded Ctrl-C.
4. What the automatic prune removes appears only as notes
   (`commands.ts:379-391`). It is in neither the JSON output nor `--report`.
5. Two answers to "is this run alive?": the executor checks the pid
   (`update/execute.ts:1504`), prune the pid and its start time
   (`prune.ts:135`). A reused pid makes them disagree.
6. `--keep-failed` and `--discard-kept` are checked for a missing `--apply`
   only after the survey's listings and fetches (`update.ts:678-681`).
7. A probe folder left by a hard kill in the project root's `.pr-update/` is
   outside every prune walk (`update/kept.ts:456-457`, `prune.ts:910-933`).

### Structure

8. `pruneMirror` and `managedClones` are each one function of over 400 lines,
   built from nested closures.
9. One clone lock's life spans four files: declared in `survey.ts:176-229`,
   built in `mirror.ts`, adapted in `update.ts:917-925`, used in
   `update/execute.ts`.
10. The rules for running git outside the project root (hooks off, repository
    variables cleared, absolute `PATH`) live in the executor
    (`update/execute.ts:1045-1052`, `1149-1181`), so survey, locate, mirror and
    prune import the executor for them. The rerere helpers now sit between
    them.
11. The rule that a kept tree a person touched is theirs is applied in three
    places: `settleKept`, the keep step of `updateAll` with `keepWorktree`, and
    prune.
12. Flag checks are split between `commands.ts`, the start of the run and after
    the survey, and the repair choice is worked out twice
    (`commands.ts:715-722`, `309-315`).
13. Most code reads the environment the CLI passes in, but five places read
    `process.env` directly (`preflight.ts:113`, `machine.ts:164`,
    `update/execute.ts:1046`, `1077`, `mirror.ts:594`). The terminal seam
    covers only the clone question.
14. `survey` builds the whole update environment, repair and attempt stores
    included, and uses none of it (`commands.ts:491`).

### Docs that disagree with the code

15. Fixed (`2d1482d8`). The `--apply` help said "Without it, nothing is
    written" (`commands.ts:579`). A rehearsal makes worktrees, scratch branches
    and commits, runs resolvers and verify, fetches, and takes clone locks.
16. Fixed (`92d63727`). Rerere was described as the first resolver, but
    nothing turned it on. `update --apply` now runs its merges and rebases with
    rerere on (`integrationEnv` in `update/execute.ts`).
17. Fixed (`2d1482d8`). D-0005's trust bullet named fewer guarded settings
    than `trust.ts:151-159` checks, and its directory table showed a flat
    `attempts/` where the code nests by repository.
18. Fixed (`2d1482d8`). The README said `survey` always exits 0. A failed PR
    listing gives a non-zero exit.
19. Fixed (`2d1482d8`). `Ports.resolveVerifyVerbs` said every surveyed
    repository is asked; the code skips those the trust gate refused and
    those whose listing failed (`update.ts:742-747`).

### Found in the final check

20. A replayed resolution is not named in the report. rerere stages it with
    `autoUpdate`, so no resolver or repair sees the path, and the outcome lists
    no resolved path for it; only verify checks it
    (`update/execute.ts:1074-1085`). A merge commit says rerere resolved it
    only when every conflicted path was replayed.
21. Removing a PR's resolutions removes only the `postimage` file of its
    variant (`update/execute.ts:1142-1146`). The `preimage` git writes at
    the conflict stays in `rr-cache/` until git's `gc` expires it (15 days by
    default for an unresolved entry). It is not replayed, but it takes space.
22. Fixed (`3722c693`). Two runs on one repository share its `rr-cache/`,
    and so does the person's own checkout. A removal took every new
    resolution of the conflict, so one recorded meanwhile by another run or by
    the person was lost. Each conflict is now tracked by its variant, which git
    keeps apart for each preimage, and only that variant's resolution goes.
23. A repair agent can write into `rr-cache/` itself, outside what pr-update
    tracks, and that resolution is replayed into later PRs. SECURITY.md says
    so.
24. A dead run worktree that is locked and whose folder is missing shows up
    only in its clone's skip reason, not as an entry of its own
    (`prune.ts:1063-1067`, `1100-1105`).
25. The changesets list "Fixed:" entries for behaviour that is new in this
    release (the clone cache and `mirror prune`), so they read as fixes to
    released code.
