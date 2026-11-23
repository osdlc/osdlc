/**
 * `pr-update mirror`: the answers of the first-run question about cloning, as commands
 * (`standards/cli-interface.md`, section 8). `enable` writes `checkout: mirror`, `disable`
 * writes `checkout: local`, both into pr-update's machine file (`machine.ts`).
 */

import {
  CommandError,
  UsageError,
  defineCommand,
  defineGroup,
  type Group,
} from '@osdlc/cli-tool/command'
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

/** The `mirror` group: `enable` and `disable`. */
export function mirrorCommand(): Group {
  return defineGroup({
    summary: 'say whether a --repo target with no checkout may be cloned',
    description:
      'update --apply serves a --repo target with no checkout on this machine from a managed ' +
      'bare clone, once you agree. It asks the first time; these commands give the answer ' +
      'ahead of time, in the machine file (~/.config/osdlc/pr-update/config.yaml on Linux and ' +
      'macOS). --mirror-dir and PR_UPDATE_MIRROR_DIR still give consent for one run.',
    commands: {
      enable: defineCommand({
        summary: 'let update --apply clone a --repo target with no checkout (checkout: mirror)',
        flags: {
          mirrorDir: {
            kind: 'string',
            valueName: 'dir',
            help: 'Keep the clones here (mirror_dir), an absolute path. It must be outside every git checkout, and new, empty or already pr-update’s.',
          },
        },
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
        examples: ['mirror disable'],
        output,
        kind: 'mirror',
        schemaVersion: 1,
        run(_input, ctx) {
          return write(ctx.env, { checkout: 'local' })
        },
        text,
      }),
    },
  })
}
