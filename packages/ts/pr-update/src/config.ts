/**
 * `PrUpdateConfig` — everything `survey`/`update` read to decide scope and
 * strategy, and the `pr_update` config section that carries it.
 *
 * The package owns the section; a host that keeps its own config file mounts
 * {@link prUpdateSection} in its section list, so that file's block and a
 * standalone run read one schema with one set of defaults. A value handed to
 * `runSurvey`/`runUpdate` means the same thing whichever host parsed it.
 *
 * Strict at every level: a misspelt key is refused, not ignored. `test_command`
 * is the one key only a standalone run reads, so it lives in
 * {@link prUpdateStandaloneSchema}, not in the shared block: a host that
 * resolves `verify: test` itself (from its own command lists) never sees it.
 */

import { z } from 'zod'

import { defineConfigSection, type ConfigKeyMeta } from '@osdlc/config-layers'

import { REPAIR_AGENTS } from './repair/names.ts'

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
    on_rebase_conflict: z
      .enum(['merge', 'fail'])
      .default('merge')
      .describe(
        'What a rebase does when it stops on a conflict the automatic rungs (rerere, lockfile, resolvers, generators) cannot clear. The rungs run at every stop. `merge` (default) aborts the rebase and retries the PR as a merge, which resolves the conflict once and is where `repair` is offered it; the result then reports strategy `merge` with the reason. `fail` reports the PR as a conflict and calls no repair.',
      ),
    lockfile_install: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .default(null)
      .describe(
        'Shell verb that rebuilds lockfiles from their manifests (`bun install`, `cargo generate-lockfile`, …), run in the update worktree. A lockfile conflict is resolved by taking the base side and re-running this, because a lockfile is derived and the merged manifest is what it must be derived from. Null (the default) means lockfile conflicts are left for a human: taking a side without re-deriving would push a lockfile that disagrees with its own manifest, which is worse than not updating.',
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
                'Shell command that rebuilds the artifact, run in the update worktree. Same shape as a `workflows:` entry.',
              ),
          })
          .strict(),
      )
      .default([])
      .describe(
        "Project-specific conflict resolvers for generated artifacts, first match wins. A conflict in a file a generator owns is not a judgement call — it is `re-run the generator`, and the run's output is the resolution. Lockfiles are handled without configuration; this is for a project's own codegen (`docs/index.md` rebuilt by `make docs`, say). Every conflicted path in a PR must be claimed by some rung or the update is left for a human.",
      ),
    verify: z
      .enum(['none', 'check', 'test'])
      .default('none')
      .describe(
        "What must pass before an updated branch is pushed. `none` (default) because the deterministic tier only ever produces a merge git itself resolved or an artifact a generator rebuilt, and running the project's whole gate once per PR is not affordable across a 50-PR run — CI on the PR is the real gate. `check` runs the host's check commands anyway, for a project where a bad push is expensive. `test` runs the project's explicitly configured test commands (a standalone run reads `test_command`): it never falls back to detection, and when it resolves to no command the update fails before touching any PR. Both are trust-gated like every other project-sourced command: they need the repository trusted or a one-run trust flag.",
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
      })
      .strict()
      .refine((r) => r.command === null || r.agent === null, {
        message: '`repair.command` and `repair.agent` are mutually exclusive; set one',
      })
      .prefault({})
      .describe(
        'The last rung of the conflict ladder, called once per kind only when nothing deterministic resolved the problem, and only on a merge: a rebase that needs it is retried as a merge first. Never called in a rehearsal (no `--apply`).',
      ),
    max_failed_attempts: z
      .number()
      .int()
      .min(0)
      .default(1)
      .describe(
        "Skip a PR once its update has failed this many times at the same head and base sha, until either moves. Failures from `--apply` runs are recorded in `.pr-update/attempts/` (one file per branch); a successful update clears the PR's entries. 0 disables the check. The retry-failed flag of `update` ignores it for one run.",
      ),
  })
  .strict()

/**
 * What a standalone run's `pr_update:` block accepts: the shared block plus
 * `test_command`, the one key only a standalone run reads (`standalonePorts`).
 */
export const prUpdateStandaloneSchema = prUpdateConfigSchema.extend({
  test_command: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .describe('Shell command `verify: test` runs in the update worktree in a standalone run.'),
})

const PR_UPDATE_DESCRIPTION =
  'Configures the `survey` and `update` verbs: which PRs are in scope (`author`, `include_drafts`), how an out-of-date branch is brought up to date (`strategy`, `overrides`), the cases that automatically avoid a history rewrite (`guards`), and how conflicts are resolved without a human (`lockfile_install`, `resolvers`, `verify`, `repair`), and when a failed update is retried (`max_failed_attempts`). Every key has a default and the whole block is optional, so both verbs work with no config file at all.'

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

/** Every key at its built-in default — the verb works with no config at all. */
export const DEFAULT_PR_UPDATE_CONFIG: PrUpdateConfig = prUpdateConfigSchema.parse({})
