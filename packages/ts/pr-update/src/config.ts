/**
 * `PrUpdateConfig`: everything `survey` and `update` read to decide scope and
 * strategy, and the `pr_update` config section that holds it.
 *
 * The package owns the section. A host that keeps its own config file mounts
 * {@link prUpdateSection} in its section list, so that file's block and a
 * standalone run read one schema with one set of defaults. A value passed to
 * `runSurvey` or `runUpdate` means the same thing whichever host parsed it.
 *
 * Strict at every level: a misspelt key is refused, not ignored. `test_command`
 * is the one key only a standalone run reads, so it is in
 * {@link prUpdateStandaloneSchema}, not in the shared block. A host that
 * resolves `verify: test` itself (from its own command lists) never sees it.
 */

import { z } from 'zod'

import { defineConfigSection, type ConfigKeyMeta } from '@osdlc/config-layers'

import { REPAIR_AGENTS, REPAIR_MODES } from './repair/names.ts'

/** The block's shape, bare of the section wrapper. */
export const prUpdateConfigSchema = z
  .object({
    author: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .default(null)
      .describe(
        "Only survey/update PRs by this author. `@me` is gh's own token for the authenticated user. Null (the default) means every author — appropriate for a solo repository, where filtering by author would hide nothing.",
      ),
    include_drafts: z
      .boolean()
      .default(true)
      .describe(
        'Whether draft PRs are surveyed and updated. Drafts drift like any other branch and a draft left behind for months is exactly the case this exists to surface, so they are included by default.',
      ),
    strategy: z
      .enum(['rebase', 'merge'])
      .default('rebase')
      .describe(
        "How an out-of-date branch is brought up to date. `rebase` (default) keeps each PR's history linear and its diff exactly its own commits, which matters most in a stack — a merge leaves every descendant carrying a merge commit per ancestor update. `merge` never rewrites history and so never needs a force-push. See `guards` for the cases that fall back to merge automatically.",
      ),
    restack: z
      .boolean()
      .default(false)
      .describe(
        'Update a whole stack in one run, as `update --restack` does: a PR blocked only because its parent is behind is updated right after that parent, onto the head the parent just got. `--restack` and `--no-restack` override it for one run.',
      ),
    overrides: z
      .array(
        z
          .object({
            base: z
              .string()
              .trim()
              .min(1)
              .optional()
              .describe("Glob matched against the PR's base branch name."),
            label: z.string().trim().min(1).optional().describe('Exact PR label name.'),
            strategy: z
              .enum(['rebase', 'merge', 'skip'])
              .describe('What to do when this rule matches.'),
          })
          .strict(),
      )
      .default([])
      .describe(
        'Per-PR strategy overrides, first match wins. A rule matches when every field it declares matches. Use it to pin a protected base branch to `merge`, or to let a label opt one PR out. An override beats the `reviewed` and `max_rebase_commits` guards, which are preferences — it does NOT beat `unpushed_local`, which exists to stop a force-push destroying work and is not negotiable.',
      ),
    guards: z
      .object({
        unpushed_local: z
          .enum(['skip', 'merge'])
          .default('skip')
          .describe(
            'What to do when the head branch is checked out in another worktree that holds commits the remote does not. `--force-with-lease` does NOT protect against this — it compares against the remote, which is unchanged — so a rebase here silently orphans work in progress. `skip` (default) leaves the PR alone; `merge` updates it without rewriting history.',
          ),
        reviewed: z
          .enum(['merge', 'rebase'])
          .default('merge')
          .describe(
            'What to do when a PR carries at least one submitted review. Rebasing rewrites the commits review comments are anchored to, so GitHub marks those threads outdated. `merge` (default) keeps them anchored.',
          ),
        max_rebase_commits: z
          .number()
          .int()
          .min(0)
          .default(20)
          .describe(
            'Above this many commits ahead of base, fall back to `merge`. A rebase replays every commit and can hit the same conflict once per commit, while a merge resolves it once; past some length that trade stops paying. 0 disables the guard.',
          ),
      })
      .strict()
      .prefault({})
      .describe(
        'Automatic falls-back to `merge` (or `skip`) for the cases where rewriting history costs more than the tidier tree is worth. `unpushed_local` is checked first and cannot be overridden; the other two are preferences an `overrides` rule may beat. Guards only ever step down from `rebase` — none of them turns a `merge` into a rebase.',
      ),
    submodules: z
      .enum(['auto', 'off'])
      .default('auto')
      .describe(
        "Whether the update worktree gets the repository's git submodules. `auto` (default) runs `git submodule update --init --recursive` in it when it has a `.gitmodules`, after each PR's checkout and again when the update moved a submodule pointer or changed `.gitmodules`, so `verify` verbs, resolvers and `lockfile_install` find them. A failure is reported as `submodule setup failed: <detail>` and is not recorded as a failed attempt. It clones the URLs the PR's `.gitmodules` names (never over `file` or `ext`). `off` leaves submodules alone.",
      ),
    rerere: z
      .boolean()
      .default(true)
      .describe(
        "Whether `update --apply` uses git's rerere in a managed clone, the only place it is used. On (default), a resolution a resolver or a repair made there is recorded, and a later conflict that is the same in the same run, at a later stop of the rebase or in a sibling PR, is replayed instead of resolved again: sibling PRs that meet one conflict need one resolution. One run at a time holds a clone's cache, through the clone's rerere lock (`pr-update-rerere.lock`), taken without waiting; a run that cannot get it works without rerere. The holder empties `rr-cache/` when it takes the lock, whenever a PR ends without being pushed, and when it lets go, so a replayed resolution was made in this run by a PR that was pushed or by the PR in flight; a killed holder's lock is taken over by a run that empties the cache first, and a cache that cannot be emptied turns rerere off for the run. A replayed path a resolver claims is still rebuilt; any other is reported in the result's `replayed`, and `verify` is its only check. In the project root and a located checkout, pr-update's merges and rebases always run with `rerere.enabled=false`, so your own `rr-cache/` and rerere config are never used and no `rr-cache/` is made there. `false` turns rerere off in clones too. A rehearsal never uses it.",
      ),
    on_rebase_conflict: z
      .enum(['merge', 'fail', 'repair'])
      .default('merge')
      .describe(
        'What a rebase does when it stops on a conflict the automatic rungs (rerere, see `rerere`; lockfile, resolvers, generators) cannot clear. The rungs run at every stop. `merge` (default) aborts the rebase and retries the PR as a merge, which resolves the conflict once and is where `repair` is offered it; the result then reports strategy `merge` with the reason. `fail` reports the PR as a conflict and calls no repair. `repair` calls `repair` (kind `conflict`) at the stop, then continues the rebase, for at most `repair.max_rebase_stops` stops; past that cap, or when a repair fails, it aborts the rebase and reports the PR as a conflict. It never falls back to a merge, so it suits a repository that refuses merge commits. It needs a configured repair with `conflict` in `repair.on`, and a rehearsal never calls it.',
      ),
    lockfile_install: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .default(null)
      .describe(
        'Shell verb that rebuilds lockfiles from their manifests (`bun install`, `cargo generate-lockfile`, …), run in the update worktree. A lockfile conflict is resolved by taking one side (`--ours`) and re-running this, because a lockfile is derived and the merged manifest is what it must be derived from. Null (the default) means lockfile conflicts are left for a human: taking a side without re-deriving would push a lockfile that disagrees with its own manifest, which is worse than not updating.',
      ),
    resolvers: z
      .array(
        z
          .object({
            paths: z
              .array(z.string().trim().min(1))
              .min(1)
              .describe(
                'Globs matched against each conflicted path, repo-relative. `*` spans one path segment, `**` spans any.',
              ),
            run: z
              .string()
              .trim()
              .min(1)
              .describe(
                'Shell command that rebuilds the artifact, run in the update worktree through the `runVerb` port.',
              ),
          })
          .strict(),
      )
      .default([])
      .describe(
        "Project-specific conflict resolvers for generated artifacts, first match wins. A conflict in a file a generator owns is not a judgement call — it is `re-run the generator`, and the run's output is the resolution. Lockfiles are handled without configuration; this is for a project's own codegen (`docs/index.md` rebuilt by `make docs`, say). Every conflicted path in a PR must be claimed by some rung or the update is left for a human.",
      ),
    verify: z
      .enum(['none', 'check', 'test', 'detect'])
      .default('none')
      .describe(
        "What must pass before an updated branch is pushed. `none` (default) because the deterministic tier only ever produces a merge git itself resolved or an artifact a generator rebuilt, and running the project's whole gate once per PR is not affordable across a run over many PRs — CI on the PR is the real gate. `check` runs the host's check commands anyway, for a project where a bad push is expensive. `test` runs the project's explicitly configured test commands (a standalone run reads `test_command`): it never falls back to detection, and when it resolves to no command the update fails before touching any PR. `detect` is the opt-in detected tier, kept apart from `test` so nobody gets detection by accident: it walks a fixed ladder of well-known test commands (see the README's `verify: detect`) in each PR's update worktree, prints which it chose, and fails that PR's verify, not the run, when none matches. `check`, `test` and `detect` are trust-gated like every other project-sourced command: they need the repository trusted or a one-run trust flag.",
      ),
    repair: z
      .object({
        command: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .default(null)
          .describe(
            'Shell command run in the update worktree when no resolver fixes a problem — typically an LLM call. Gets the request as JSON on stdin and in `PR_UPDATE_*` variables; exit 0 claims success. It must not commit, move HEAD or create refs: pr-update checks the tree, then commits and pushes itself. Trust-gated like `verify: check`/`test`: needs the repository trusted or a one-run trust flag. Null (the default) means no repair. Exclusive with `agent`, checked on the merged config: a local overlay that sets `command` over a project `agent` must also set `agent: null`.',
          ),
        agent: z
          .enum(REPAIR_AGENTS)
          .nullable()
          .default(null)
          .describe(
            'A built-in headless agent that does the repair: `claude`, `codex`, `cursor` or `pi`. It runs in the update worktree with file edits allowed and no prompts, under the same contract as `command`. The agent CLI must be installed and signed in. Trust-gated like `command`: an agent reads the repository and can run tools, so an untrusted repository must not start one. Null (the default) means no agent. Exclusive with `command`, checked on the merged config: a local overlay that sets `agent` over a project `command` must also set `command: null`.',
          ),
        mode: z
          .enum(REPAIR_MODES)
          .default('headless')
          .describe(
            "How `agent` runs. `headless` (default) is one unattended call. `interactive` runs the agent's own CLI in this terminal with stdio inherited, so the person can answer it or stop it; it needs a terminal and a rehearsal-free `--apply`, and a PR is repaired one at a time. `terminal` opens the session in a detached tmux session (`tmux attach -t <name>`, named in the run's notes), waits for it to end, and needs tmux on PATH. The prompt is the same, given as the session's first message. After the session ends, the same checks as a headless repair decide the result, so quitting without a fix gives `conflict` or `failed`. A mode other than `headless` is trust-gated like `agent`. Only meaningful with `agent`.",
          ),
        model: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .default(null)
          .describe(
            "The agent's own model name, passed to its CLI. Null (the default) means the CLI's default model. Only meaningful with `agent`.",
          ),
        timeout_seconds: z
          .number()
          .int()
          .min(1)
          .nullable()
          .default(null)
          .describe(
            'Kill the repair after this many seconds and treat it as having given up. Null (the default) means no limit. An agent can run for minutes, so a cap keeps one PR from holding the run.',
          ),
        on: z
          .array(z.enum(['conflict', 'verify-failed']))
          .default(['conflict'])
          .describe(
            'Which problems the repair is asked to fix: an unclaimed `conflict`, a failed `verify` step, or both.',
          ),
        max_rebase_stops: z
          .number()
          .int()
          .min(1)
          .default(3)
          .describe(
            'With `on_rebase_conflict: repair`, repair at most this many stops in one rebase, then give up and report the PR as a conflict. `guards.max_rebase_commits` bounds the rebase length, so the two together bound the number of agent calls.',
          ),
      })
      .strict()
      .refine((r) => r.command === null || r.agent === null, {
        message: '`repair.command` and `repair.agent` are mutually exclusive; set one',
      })
      .refine((r) => r.mode === 'headless' || r.command === null, {
        message:
          '`repair.mode` other than `headless` runs an agent; it cannot be used with `repair.command`',
      })
      .prefault({})
      .describe(
        'The last rung of the ladder, called once per kind only when nothing deterministic resolved the problem. A conflict repair is offered on a merge (a rebase that needs one is retried as a merge first), or at rebase stops with `on_rebase_conflict: repair`; a verify-failed repair runs for either strategy. Never called in a rehearsal (no `--apply`).',
      ),
    keep_failed: z
      .boolean()
      .default(false)
      .describe(
        "Keep the worktree of a PR whose update ended `conflict` or `failed`, as `update --keep-failed` does: it stays where it ran, in `worktrees/<host>/<owner>/<name>/` in pr-update's cache directory, the project root's as any other, on a branch named for the PR, with a failed verify's log in `.pr-update-verify.log` and its record in `kept/` in the state directory, and the run goes on in a fresh worktree. A cache cleaner that empties the cache removes it too. The tree is evidence, pr-update's own: a later run skips that PR until its head or base moves, or `--retry-failed` or `--discard-kept` is given, and then removes the tree, whatever is in it. `--no-keep-failed` overrides it for one run. Only `--apply` runs keep anything.",
      ),
    max_failed_attempts: z
      .number()
      .int()
      .min(0)
      .default(1)
      .describe(
        "Skip a PR once its update has failed this many times at the same head and base sha, until either moves. Failures from `--apply` runs are recorded in `attempts/<host>/<owner>/<name>/` in pr-update's state directory (one file per repo, head and base branch); a successful update clears the PR's entries. 0 disables the check. The retry-failed flag of `update` ignores it for one run.",
      ),
  })
  .strict()

/**
 * What a standalone run's `pr_update:` block accepts: the shared block plus
 * `test_command`, `attempts` and `lease`, the keys only a standalone run reads
 * (`standalonePorts`). A host that embeds the package supplies `Ports.attempts` and
 * `Ports.lease` itself.
 */
export const prUpdateStandaloneSchema = prUpdateConfigSchema.extend({
  attempts: z
    .object({
      store: z
        .enum(['file', 'git-ref'])
        .default('file')
        .describe(
          'Where failed updates are recorded. `file` (default) keeps them in `attempts/<host>/<owner>/<name>/` in the state directory of pr-update, so they are per machine. `git-ref` keeps them as refs on the `--remote` (one per repo, head and base branch, under `ref_prefix`), so every machine and CI job that updates the repository shares them, and also turns on the per-branch update lease (see `lease`). The remote must accept refs outside `refs/heads` and `refs/tags`; a host that refuses them fails the run with an error naming this setting.',
        ),
      ref_prefix: z
        .string()
        .trim()
        .regex(/^refs\/(?!(heads|tags|remotes)(\/|$))[^\s~^:?*[\\]+$/, {
          message:
            'must be a ref path under refs/ outside refs/heads, refs/tags and refs/remotes, with no spaces or ~^:?*[\\',
        })
        .default('refs/pr-update/')
        .describe(
          'Where `git-ref` keeps its refs: failed-attempt records under `<ref_prefix>attempts/` and update leases under `<ref_prefix>lock/`. Must start with `refs/` and stay out of `refs/heads`, `refs/tags` and `refs/remotes`. Only read when `store` is `git-ref`.',
        ),
    })
    .strict()
    .prefault({})
    .describe(
      'Where a failed update is remembered between runs (`store`) and, for `git-ref`, which refs hold it (`ref_prefix`).',
    ),
  lease: z
    .object({
      ttl_seconds: z
        .number()
        .int()
        .min(1)
        .nullable()
        .default(null)
        .describe(
          'How long a run holds the update lease on a head branch before another run may take it over. Nothing renews it, so it must outlast one PR update, repair included. Null (the default) means `repair.timeout_seconds` plus 600, or 1800 when repair has no timeout. The lease exists only with `attempts.store: git-ref`; a rehearsal never takes one.',
        ),
    })
    .strict()
    .prefault({})
    .describe(
      'The per-branch update lease, a ref `<ref_prefix>lock/<branch>` that one `update --apply` run holds while it updates that head branch. A PR whose lease another run holds is skipped. Active only with `attempts.store: git-ref`.',
    ),
  test_command: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .describe('Shell command `verify: test` runs in the update worktree in a standalone run.'),
})

const PR_UPDATE_DESCRIPTION =
  'Configures the `survey` and `update` verbs: which PRs are in scope (`author`, `include_drafts`), how an out-of-date branch is brought up to date (`strategy`, `overrides`, `restack`), the cases that automatically avoid a history rewrite (`guards`), and how conflicts are resolved without a human (`lockfile_install`, `resolvers`, `verify`, `repair`), and when a failed update is retried (`max_failed_attempts`; a standalone run also reads `attempts` and `lease`). Every key has a default and the whole block is optional, so both verbs work with no config file at all.'

const PR_UPDATE_META: ConfigKeyMeta = {
  category: 'automation',
  consumers: ['src/survey.ts#runSurvey', 'src/update.ts#runUpdate'],
  layers: ['project', 'local'],
  applies_via: 'read',
  enforcement: 'enforced',
  runs_in: ['cli', 'loop'],
}

export const prUpdateSection = defineConfigSection({
  key: 'pr_update',
  schema: prUpdateConfigSchema.prefault({}).describe(PR_UPDATE_DESCRIPTION),
  meta: PR_UPDATE_META,
})

/**
 * The `pr_update` section as the standalone `pr-update` binary mounts it: the
 * same key and meta, with {@link prUpdateStandaloneSchema} so `test_command`
 * is accepted. A host that mounts {@link prUpdateSection} never sees it.
 */
export const prUpdateStandaloneSection = defineConfigSection({
  key: 'pr_update',
  schema: prUpdateStandaloneSchema.prefault({}).describe(PR_UPDATE_DESCRIPTION),
  meta: PR_UPDATE_META,
})

export type PrUpdateConfig = z.infer<typeof prUpdateConfigSchema>

export type PrUpdateStandaloneConfig = z.infer<typeof prUpdateStandaloneSchema>

/** Every key at its built-in default, so the commands work with no config. */
export const DEFAULT_PR_UPDATE_CONFIG: PrUpdateConfig = prUpdateConfigSchema.parse({})
