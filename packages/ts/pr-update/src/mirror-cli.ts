/**
 * `pr-update mirror`: the answers of the first-run question about cloning, as commands
 * (`standards/cli-interface.md`, section 8). `enable` writes `checkout: mirror`, `disable`
 * writes `checkout: local`, both into pr-update's machine file (`machine.ts`). `list` shows the
 * managed clones and leftover run worktrees, and `prune` removes them (`prune.ts`).
 */

import { EXIT } from '@osdlc/cli-tool'
import {
  CommandError,
  UsageError,
  defineCommand,
  defineGroup,
  outcome,
  type Group,
} from '@osdlc/cli-tool/command'
import type { CommandRunner } from '@osdlc/command-seam'
import { CONFIG_INVALID_EXIT, ConfigInvalidError } from '@osdlc/config-layers'
import { homeDir } from '@osdlc/tiered-dirs'
import { z } from 'zod'

import { machineFile } from './machine.ts'
import {
  MirrorDirError,
  checkMirrorDir,
  mirrorDirFrom,
  writeMirrorAnswer,
  type MirrorAnswer,
} from './mirror.ts'
import { listMirror, pruneMirror, renderListText, renderPruneText } from './prune.ts'

/** What `mirror enable` and `mirror disable` print. */
const output = z.object({
  file: z.string().describe('The machine file written.'),
  checkout: z.enum(['mirror', 'local']).describe('The `checkout` value it now holds.'),
  mirrorDir: z
    .string()
    .nullable()
    .describe('The `mirror_dir` value it now holds, or null when it has none.'),
})

type Output = z.infer<typeof output>

/** Write `answer`; the person's command wins over a write that landed since the file was read. */
function write(env: Record<string, string | undefined>, answer: MirrorAnswer): Output {
  const file = machineFile({ env })
  let config
  try {
    config = writeMirrorAnswer(file, answer).config
  } catch (e) {
    // A file that is not YAML, or not a map, is left as it is: exit 14, as for any config file
    // that does not load.
    if (e instanceof ConfigInvalidError) {
      throw new CommandError(e.message, { exit: CONFIG_INVALID_EXIT, code: 'config-invalid' })
    }
    throw new CommandError(`cannot write ${file.path()}: ${(e as Error).message}`)
  }
  return {
    file: file.path(),
    checkout: config.checkout ?? answer.checkout,
    mirrorDir: config.mirror_dir ?? null,
  }
}

function text(out: Output): string {
  const dir = out.mirrorDir === null ? '' : `\nmirror_dir: ${out.mirrorDir}`
  return `${out.file}\ncheckout: ${out.checkout}${dir}\n`
}

const listOutput = z.object({
  mirrorDir: z.string().describe('The clone directory listed.'),
  clones: z
    .array(
      z.object({
        repo: z.string().describe('host/owner/name.'),
        path: z.string().describe('The clone, absolute.'),
        bytes: z.number().int().describe('The bytes its files take.'),
        lastUsed: z.string().describe('When a run last used it, as an ISO time.'),
        kept: z.array(z.string()).describe('Its kept worktrees, by path.'),
      }),
    )
    .describe("The managed clones: folders holding pr-update's clone marker."),
  worktreesDir: z.string().describe("The cache's worktrees directory listed."),
  worktrees: z
    .array(
      z.object({
        path: z.string().describe('The run worktree, absolute.'),
        repo: z.string().describe('host/owner/name.'),
        running: z.boolean().describe('True while the run that made it is alive.'),
        owner: z
          .string()
          .nullable()
          .describe('The git directory that owns it, or null when its records do not say.'),
      }),
    )
    .describe('Run worktrees of targets other than the project root. A dead run leaves its own.'),
})

const pruneEntry = z.object({
  kind: z.enum(['worktree', 'kept', 'clone', 'leftover']),
  path: z.string(),
  repo: z.string().optional().describe('host/owner/name, when known.'),
  bytes: z.number().int(),
  reason: z.string().optional().describe('Why it was left, or the error that stopped it.'),
  skip: z
    .enum(['folder', 'foreign', 'busy', 'in-use', 'kept'])
    .optional()
    .describe(
      'For one left alone, the kind of reason: a folder someone else could write to or owns (folder), not a clone pr-update may change (foreign), another run holds its lock (busy), a worktree in use (in-use), kept worktrees (kept).',
    ),
})

const pruneOutput = z.object({
  dryRun: z.boolean(),
  mirrorDir: z.string().describe('The clone directory walked.'),
  allClones: z.boolean().describe('Every clone was eligible, whatever its age (--all-clones).'),
  olderThanDays: z
    .number()
    .int()
    .nullable()
    .describe(
      'The age a clone had to pass, in days; null with --all-clones, or at age 0 (no clone).',
    ),
  removed: z.array(pruneEntry).describe('What was removed, or would be with --dry-run.'),
  skipped: z.array(pruneEntry).describe('What was left alone, with why.'),
  failed: z.array(pruneEntry).describe('What could not be removed, with the error.'),
  freedBytes: z.number().int(),
})

const MIRROR_DIR_HELP =
  'The clone directory to walk, an absolute path or one starting ~/, instead of PR_UPDATE_MIRROR_DIR, mirror_dir or the default: a directory left behind by a moved mirror_dir, say.'

/** The `--mirror-dir` of `list` and `prune`, made absolute. Not consent: neither command clones. */
function walkedDir(raw: string | undefined, env: Record<string, string | undefined>) {
  if (raw === undefined) return undefined
  return usage(() => mirrorDirFrom(raw, homeDir({ env }), '--mirror-dir'))
}

/** `fn`, with a clone directory it cannot use (a relative path, say) as a usage error. */
function usage<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof MirrorDirError) throw new UsageError(e.message)
    throw e
  }
}

/**
 * The `mirror` group: `enable`, `disable`, `list` and `prune`. `git` runs git, and `claim` takes
 * a clone's lock, for a test.
 */
export function mirrorCommand(
  seams: {
    git?: CommandRunner | undefined
    claim?: ((path: string, waitMs: number) => string | null) | undefined
  } = {},
): Group {
  return defineGroup({
    summary: 'the managed clones of --repo targets with no checkout: consent, list and prune',
    description:
      'update --apply serves a --repo target with no checkout on this machine from a managed ' +
      'bare clone, once you agree. It asks the first time; enable and disable give the answer ' +
      'ahead of time, in the machine file (~/.config/osdlc/pr-update/config.yaml on Linux and ' +
      'macOS). --mirror-dir and PR_UPDATE_MIRROR_DIR still give consent for one run. list shows ' +
      'the clones and the run worktrees in the cache, and prune removes old ones.',
    commands: {
      enable: defineCommand({
        summary: 'let update --apply clone a --repo target with no checkout (checkout: mirror)',
        flags: {
          mirrorDir: {
            kind: 'string',
            valueName: 'dir',
            help: 'Keep the clones here (mirror_dir), an absolute path or one starting ~/. It must be outside every git checkout, and new, empty or already pr-update’s.',
          },
        },
        exits: { 14: 'the machine file is not valid YAML, or not a map; it is left as it is' },
        examples: ['mirror enable', 'mirror enable --mirror-dir ~/clones'],
        output,
        kind: 'mirror',
        schemaVersion: 1,
        run({ flags }, ctx) {
          let dir: string | undefined
          if (flags.mirrorDir !== undefined) {
            try {
              dir = mirrorDirFrom(flags.mirrorDir, homeDir({ env: ctx.env }), '--mirror-dir')
              checkMirrorDir(dir)
            } catch (e) {
              if (e instanceof MirrorDirError) throw new UsageError(e.message)
              throw e
            }
          }
          return write(ctx.env, {
            checkout: 'mirror',
            ...(dir === undefined ? {} : { mirror_dir: dir }),
          })
        },
        text,
      }),
      disable: defineCommand({
        summary: 'never clone: skip a --repo target with no checkout (checkout: local)',
        exits: { 14: 'the machine file is not valid YAML, or not a map; it is left as it is' },
        examples: ['mirror disable'],
        output,
        kind: 'mirror',
        schemaVersion: 1,
        run(_input, ctx) {
          return write(ctx.env, { checkout: 'local' })
        },
        text,
      }),
      list: defineCommand({
        summary: 'show the managed clones and the run worktrees in the cache',
        description:
          'Each clone: its repository, size, when a run last used it, and its kept worktrees. ' +
          'Then each run worktree under the cache, and whether the run that made it is gone. ' +
          'Takes no lock and changes nothing.',
        flags: { mirrorDir: { kind: 'string', valueName: 'dir', help: MIRROR_DIR_HELP } },
        examples: ['mirror list', 'mirror list --json'],
        output: listOutput,
        kind: 'mirror-list',
        schemaVersion: 1,
        readOnly: true,
        run({ flags }, ctx) {
          const dir = walkedDir(flags.mirrorDir, ctx.env)
          return usage(() =>
            listMirror({ env: ctx.env, dir, git: seams.git, notice: (l) => ctx.note(l) }),
          )
        },
        text: renderListText,
      }),
      prune: defineCommand({
        summary:
          'remove clones unused for mirror_max_age_days (every clone with --all-clones), and dead runs’ worktrees',
        description:
          'Removes the worktree of every run that is gone, whatever its age, through the git ' +
          'directory that owns it, and leftover temporary folders older than an hour. Then removes ' +
          'each managed clone not used for mirror_max_age_days (default 30; at 0 none, unless ' +
          '--older-than or --all-clones). It never removes a clone another run holds, one with a kept ' +
          'worktree (unless --discard-kept), or a folder pr-update did not make. It never waits ' +
          'for a lock. update --apply prunes the same way when it ends, if it used the cache.',
        flags: {
          olderThan: {
            kind: 'string',
            valueName: 'days',
            help: 'Remove clones unused for more than this many days, instead of mirror_max_age_days.',
          },
          // `--all` is cli-tool's own (`--help --all`), which refuses it here.
          allClones: {
            kind: 'boolean',
            help: 'Remove every clone, whatever its age. (Not --all, which goes with --help.)',
          },
          dryRun: { kind: 'boolean', help: 'Only say what would be removed. Takes no lock.' },
          discardKept: {
            kind: 'boolean',
            help: 'Remove the kept worktrees of a clone being removed, so it can go too.',
          },
          mirrorDir: { kind: 'string', valueName: 'dir', help: MIRROR_DIR_HELP },
        },
        exits: { 1: 'something could not be removed' },
        examples: [
          'mirror prune',
          'mirror prune --dry-run',
          'mirror prune --older-than 7',
          'mirror prune --all-clones --discard-kept',
        ],
        output: pruneOutput,
        kind: 'mirror-prune',
        schemaVersion: 1,
        run({ flags }, ctx) {
          let olderThanDays: number | undefined
          if (flags.olderThan !== undefined) {
            // Digits only: `Number` reads '', ' ', '1e1' and '0x7' as numbers.
            olderThanDays = /^\d+$/.test(flags.olderThan) ? Number(flags.olderThan) : Number.NaN
            if (!Number.isSafeInteger(olderThanDays)) {
              throw new UsageError(
                `--older-than must be a whole number of days, 0 or more, got '${flags.olderThan}'`,
              )
            }
          }
          if (olderThanDays !== undefined && flags.allClones === true) {
            throw new UsageError('--older-than and --all-clones cannot be used together')
          }
          const dir = walkedDir(flags.mirrorDir, ctx.env)
          const report = usage(() =>
            pruneMirror({
              env: ctx.env,
              dir,
              git: seams.git,
              claim: seams.claim,
              notice: (l) => ctx.note(l),
              olderThanDays,
              allClones: flags.allClones === true,
              dryRun: flags.dryRun === true,
              discardKept: flags.discardKept === true,
            }),
          )
          return report.failed.length > 0 ? outcome(report, EXIT.error) : report
        },
        text: renderPruneText,
      }),
    },
  })
}
