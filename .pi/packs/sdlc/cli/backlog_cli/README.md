# `backlog` noun — `sdlc backlog …`

The user-facing **backlog-capture** noun of the unified `sdlc` CLI. Turns a headline (plus optional
body/tags/state) into a schema-valid `docs/planning/backlog/B-XXXX-<slug>.md` (id minted via the
identifier registry) and lands it on a rolling capture PR.

Full design: [`docs/planning/decisions/sdlc-cli/`](../../../docs/planning/decisions/sdlc-cli/). The
succinct rule:
[S0004](../../../docs/planning/standards/S-0004-sdlc-cli-llm-head-deterministic-tail.md).

## Layout

```text
solutions/ontological/cli/backlog_cli/
  index.ts      # buildBacklogCommand() + dispatchBacklog()
  _common.ts    # noun specifics: PR marker, CAPTURE_BRANCH, slug derivation,
                # schema-version lookup, EXIT_MODEL_ERROR; re-exports the base
  create.ts     # the deterministic tail
  capture.ts    # the LLM head (claude -p → create); the ONLY module here that
                # invokes claude
  capture.test.ts  # tests for the capture verb
  tests/        # create.test.ts, dispatch.test.ts
```

`backlog` is a **visible** noun (`hidden=False`) — it appears in
`sdlc --help`. It resolves **no** noun-scoped configuration, so
`sdlc backlog …` runs without any `lease_authority` config.

## `create` — the deterministic tail

```text
sdlc backlog create --headline "<text>" [--slug <kebab>] [--tag <t>]...
                    [--body "<text>"] [--state <backlog-state>]
                    [--project-root <path>] [--dry-run]
```

Structured args only — **no LLM reference anywhere in this path** (this is the
*tail* of the head/deterministic-tail split; the `capture` LLM head is below).
On success it:

1. Resolves the slug — `--slug` if given, else derived from `--headline`
   (lowercase, non-alphanumeric runs → `-`, trimmed, capped at ~60 chars).
   Backlog filenames carry **no** date prefix (unlike tasks).
2. Mints a `B-NNNN` id (collision-checked; an existing file with the same slug reuses its id) and
   writes `docs/planning/backlog/B-NNNN-<slug>.md` with minimal valid frontmatter (`type: backlog`,
   `schema_version` = the backlog schema's current top-level `version`, `id` = the minted `B-NNNN`,
   optional `state`/`tags`, `last_reviewed` = today) plus the freeform body, and validates it with
   `sdlc entities validate` (routing through the backlog `contract(...)`).
3. Manages the rolling `backlog-capture` branch (see below).
4. Commits (`docs(backlog): capture <slug>`), pushes, creates-or-updates the
   PR, and prints the marker line `PR: <url>`.

### Rolling `backlog-capture` branch (AC-6)

Unlike the `task/`, `docs/`, and `chore/` prefixes in
[`solutions/ontological/conventions/branch-naming.md`](../../conventions/branch-naming.md),
`backlog-capture` is **not** a per-item namespace — there is exactly one
`backlog-capture` branch at a time, with no trailing slug, and it is managed
entirely by this script (not a branch humans or skills create by hand). It
accumulates a stream of backlog-capture commits behind **one** open PR
targeting `main`, and is owned exclusively by this flow — unrelated commits
should never be pushed to it.

A single probe — `gh pr list --head backlog-capture --state open` — decides
the behavior:

| Situation | Behavior |
|---|---|
| **Open capture PR exists** | Check out `backlog-capture`, append the new file + commit, push. **No** second PR. Return the existing PR's URL. |
| **No open capture PR** | `git fetch --prune origin` (refreshes `origin/main` and drops the stale `origin/backlog-capture` tracking ref left after a merge), `checkout -B backlog-capture origin/main`, commit, plain `git push`, then `gh pr create`. |

The "no open PR" arm covers both the first-ever run and the after-merge case:
once the capture PR merges and the branch is gone, the open-PR probe is empty,
so the next run starts a fresh branch off `main`.

Both arms push **plain** — never `--force`/`--force-with-lease`. The plain
push's fast-forward check is a compare-and-swap evaluated server-side against
the remote's ground truth, so stale local remote-tracking refs cannot poison
it. (A bare `--force-with-lease` here compares against the local
`origin/backlog-capture` cache, which is reliably stale in the *normal*
after-merge state — GitHub auto-deletes the remote branch, nothing prunes the
local cache, and the next fresh-arm push dies with `stale info`.) Per remote
state the plain push does the right thing:

- branch absent (after-merge auto-delete, or first-ever run) → created;
- leftover tip already merged to `main` (merge-commit workflow makes it an
  ancestor) → fast-forwarded over;
- concurrent capture pushed first, or a leftover holds **unmerged** commits →
  rejected loudly with a hint (re-run to append to the winner's PR, or
  inspect-then-delete the leftover). Unmerged captures are never silently
  discarded, which is exactly the failure mode a force push would reintroduce.

### `--dry-run`

Performs **no** git/gh side effects and writes **no** file into the worktree
(it validates the candidate against a temp copy). Prints the slug, the path it
*would* write, the branch, the gh/git plan, and the `PR: <url>` marker shape,
then exits 0.

## `capture` — the LLM head (superset of `create`)

```text
sdlc backlog capture ["<freeform text>"] [any create flag]... [--no-llm]
                     [--dry-run]
```

The ergonomic front door. Takes a freeform positional idea **plus** every flag
`create` accepts (`--headline` is optional here), interprets the freeform text
into the missing structured fields via `claude -p`, merges them (explicit flags
always win), then calls `create` for all side effects. **This is the only
module under `backlog_cli/` that invokes `claude -p`** — `create.ts` and
`_common.ts` stay structurally model-free.

### When the model runs vs. is skipped

The model is invoked only when there is something to interpret AND the user
asked for it. It is skipped when:

- `--no-llm` is passed; or
- `--headline` is already given (the one *required* `create` input is present —
  a "complete structured" invocation); or
- no freeform text was supplied (nothing to interpret).

Otherwise `claude -p` runs to derive `{headline, body, tags}`.

### The `claude -p` JSON contract

`capture` shells `claude -p --output-format json "<prompt>"` (headless). Two
layers of JSON:

1. The `--output-format json` **envelope** — a JSON object whose `result` field
   carries the model's text reply.
2. Inside that text, the **contract** object the prompt asks for:

   ```json
   {"headline": "<concise one-line>", "body": "<longer text, or null>", "tags": ["<kebab-tag>", ...]}
   ```

   `headline` is required and non-empty; `body` may be `null`; `tags` defaults to `[]`. The exact
   prompt and shape are pinned in `capture.ts` (`MODEL_PROMPT_INSTRUCTION`, `parseContract`).

### Merge precedence

Explicit flags always win over model-derived values; the model only fills gaps:

| Field | Resolution |
|---|---|
| headline | `--headline` if given, else the model's |
| body | `--body` if given (even `""`), else the model's |
| tags | the explicit `--tag` set if any were passed (replaces inferred tags wholesale), else the model's inferred tags |
| state / slug | passed straight through to `create` |

### Failure modes

If the model **must** run but the boundary fails — the `claude` binary is not
found on `PATH`, it exits nonzero, the envelope is not JSON, the
inner reply is not the contract JSON, or `headline` is missing/blank — `capture`
prints a clear stderr message and exits with the distinct code
`EXIT_MODEL_ERROR` (`16`). It never silently falls back to an empty headline; the
message points the user at `--headline …` / `--no-llm` to proceed without the
model.

### `--dry-run`

Flows through to `create`'s dry-run: no git/gh/filesystem side effects. The
model call (if any) is read-only.

## The git/gh seam (testability)

Two seams, one per boundary:

- **git / gh** (`Runner` / `RunnerFactory` from `@osdlc/typed-gh`,
  re-exported from `create.ts`). `create(args, runnerFactory)` accepts a factory so the test
  suite injects a recording mock that returns canned `gh pr list` payloads and
  records the command sequence — exercising the whole tail (including all three
  AC-6 branches) offline, with no network and no real pushes.
- **`claude -p`** (`capture.ModelRunner`). `capture(args, modelRunnerFactory,
  runnerFactory)` injects a fake for the model boundary *and* forwards the
  git/gh factory, so the whole head→tail path runs offline with neither a real
  `claude` nor a real git/gh. **No test ever shells the real `claude`.**

The validator and the file write are the only real I/O the tests touch (against
a temp project root).

## Exit codes

Shares the CLI-wide base from [`../_common.ts`](../_common.ts); the backlog noun
claims `16` for the `capture` head's model boundary:

| Code | Name | Meaning |
|---|---|---|
| `0` | `EXIT_OK` | success (file written, PR opened/updated, `PR: <url>` printed) |
| `1` | `EXIT_GENERIC` | a well-formed command that failed — bad slug, schema-validation failure, git-or-gh failure, no headline available |
| `2` | `EXIT_USAGE` | the command cannot run as typed |
| `16` | `EXIT_MODEL_ERROR` | (`capture` only) model boundary failed — `claude` absent, exited nonzero, or returned unparseable / contract-incomplete output |

## stdout marker

On success the verb prints exactly one line beginning `PR:` followed by the
PR URL (`PR_MARKER_PREFIX` in `_common.ts`). Callers/tests grep for it.
