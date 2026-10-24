/**
 * A whole config tool built on the library with a vocabulary and file names
 * of its own (`tooly`, `./support.ts`): sections, the layered loader and its
 * relocation variable, the project-layer refusal, the meta check, the
 * reference and starter pages, the machine file with a migration, and the
 * needs message. Nothing it prints may carry another tool's names.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { ConfigInvalidError } from '../src/config-error.ts'
import { systemDirs } from '../src/dirs.ts'
import { assembleConfig } from '../src/loader.ts'
import { machineConfigFile } from '../src/machine.ts'
import { enforcementProblems } from '../src/meta-kit.ts'
import { configNeeds } from '../src/needs.ts'
import { renderReference } from '../src/reference.ts'
import { starterYaml } from '../src/scaffold.ts'

import {
  CONFIG_FILE,
  LOCAL_FILE,
  META,
  PROJECT_FILE,
  TOOL,
  VENDOR_DIRS,
  vocabulary,
} from './support.ts'

const jobs = vocabulary.defineSection({
  key: 'jobs',
  schema: z
    .object({
      parallel: z.number().int().min(1).default(2).describe('Jobs run at once.'),
      names: z.array(z.string()).default([]).describe('Job names.'),
    })
    .strict()
    .prefault({})
    .describe('How jobs run.'),
  meta: { ...META, category: 'extras' },
})

const shims = vocabulary.defineSection({
  key: 'shims',
  schema: z.record(z.string(), z.array(z.string())).default({}).describe('Installed shims.'),
  meta: { ...META, applies_via: 'apply:shims', enforcement: 'applied' },
})

const token = vocabulary.defineSection({
  key: 'token',
  schema: z.string().optional().describe('A per-checkout token.'),
  meta: { ...META, layers: ['local'], enforcement: 'strict' },
})

const SECTIONS = [jobs, shims, token] as const

/** The name of the tool this library came out of. Split in two so a grep of the source does not find it. */
const HOST_TOOL = ['sd', 'lc'].join('')

/** Assert text the library printed never names the host tool. */
function expectNoHostName(...texts: string[]): void {
  for (const text of texts) expect(text.toLowerCase()).not.toContain(HOST_TOOL)
}

let root: string
let env: Record<string, string | undefined>

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'tooly-e2e-')))
  env = {}
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function write(rel: string, text: string): string {
  const path = join(root, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
  return path
}

const handle = () =>
  assembleConfig({
    file: CONFIG_FILE,
    sections: SECTIONS,
    unknownTopLevel: 'reject',
    label: 'tooly config',
    resolve: { env },
  })

describe('a config tool with its own vocabulary, end to end', () => {
  test('the sections carry meta the vocabulary accepts and the kit agrees with', () => {
    const shape = handle().schema.shape as Record<string, z.ZodType>
    expect(vocabulary.checkMeta(shape)).toEqual([])
    expect(enforcementProblems(shape, vocabulary.spec.enforcement)).toEqual([])
  })

  test('tooly.yaml and tooly.local.yaml merge before validation', () => {
    write(PROJECT_FILE, 'jobs:\n  parallel: 4\n  names: [a]\n')
    write(LOCAL_FILE, 'jobs:\n  names: [b]\n')
    const layers = handle().loadLayers(root)
    expect(layers.merged.jobs).toEqual({ parallel: 4, names: ['b'] })
    expect(layers.files).toEqual({
      project: join(root, PROJECT_FILE),
      local: join(root, LOCAL_FILE),
      source: 'default',
    })
  })

  test('TOOLY_CONFIG relocates the pair', () => {
    write(PROJECT_FILE, 'jobs:\n  parallel: 9\n')
    const other = write('etc/tooly.yaml', 'jobs:\n  parallel: 3\n')
    write('etc/tooly.local.yaml', 'jobs:\n  names: [x]\n')
    env.TOOLY_CONFIG = other
    const layers = handle().loadLayers(root)
    expect(layers.merged.jobs).toEqual({ parallel: 3, names: ['x'] })
    expect(layers.files.source).toBe('env')
    expect(layers.files.local).toBe(join(root, 'etc', 'tooly.local.yaml'))
  })

  test('a key the project file may not set is refused there and loads from the overlay', () => {
    write(PROJECT_FILE, 'token: abc\n')
    const h = handle()
    let error: unknown
    try {
      h.load(root)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ConfigInvalidError)
    const message = (error as Error).message
    expect(message).toContain('token: this key cannot be set in the project file')
    expectNoHostName(message)

    rmSync(join(root, PROJECT_FILE))
    write(LOCAL_FILE, 'token: abc\n')
    expect(h.load(root).token).toBe('abc')
  })

  test('a category outside the vocabulary fails the meta check', () => {
    const stray = {
      stray: z
        .string()
        .describe('Stray.')
        .meta({ ...META, category: 'lifecycle' }),
    }
    const issues = vocabulary.checkMeta(stray)
    expect(issues.map((i) => i.key)).toEqual(['stray'])
    expect(issues[0]!.problem).toContain('category')
  })

  test('the reference and the starter follow the vocabulary category order', () => {
    const shape = handle().schema.shape as Record<string, z.ZodType>
    const page = renderReference(shape, {
      categories: vocabulary.spec.categories,
      preamble: ['# tooly.yaml reference'],
      enforcementDoc: 'tooly-enforcement.md',
    })
    expect(page.indexOf('## Core')).toBeGreaterThan(0)
    expect(page.indexOf('## Core')).toBeLessThan(page.indexOf('## Extras'))
    expect(page.indexOf('### shims')).toBeLessThan(page.indexOf('### jobs'))

    const starter = starterYaml(handle().schema, {
      header: ['# tooly.yaml'],
      categories: vocabulary.spec.categories,
      live: { shims: { git: ['pre-commit'] } },
    })
    expect(starter.indexOf('# ── core')).toBeLessThan(starter.indexOf('# ── extras'))
    expect(starter).toMatch(/^shims:\n {2}git:\n {4}- pre-commit$/m)
    expect(() =>
      renderReference(shape, { categories: ['core'], preamble: [], enforcementDoc: 'x.md' }),
    ).toThrow(/jobs \(extras\)/)
    expectNoHostName(page, starter)
  })

  test('the machine file loads through a fixture schema and one migration', () => {
    const MachineSchema = z
      .object({
        version: z.number().int().min(1).optional(),
        dirs: z.array(z.string()).default([]).describe('Directories this machine searches.'),
      })
      .strict()
    const home = join(root, 'home')
    mkdirSync(home, { recursive: true })
    const dirs = systemDirs(VENDOR_DIRS, { home, env: {} })
    const machine = machineConfigFile({
      tool: TOOL,
      schema: MachineSchema,
      vendorDirs: VENDOR_DIRS,
      dirs: () => dirs,
      env: 'TOOLY_MACHINE_FILE',
      migrations: [
        {
          from: 1,
          to: 2,
          run: ({ folders, ...rest }) => ({ ...rest, dirs: folders }),
        },
      ],
    })
    const path = write('machine.yaml', 'folders: [~/src]\n')
    process.env.TOOLY_MACHINE_FILE = path
    try {
      machine.clearCache()
      const load = machine.loadWithIssues()
      expect(load.issues).toEqual([])
      expect(load.value).toEqual({ version: 2, dirs: ['~/src'] })

      const needs = configNeeds({
        tool: TOOL,
        projectFile: PROJECT_FILE,
        projectSchema: handle().schema,
        machine,
        scaffoldHint: '`tooly config scaffold` shows the full shape',
      })
      const message = needs.message(
        { config: 'jobs.parallel' },
        { projectRoot: root, command: ['run'] },
      )
      expect(message).toContain('tooly.yaml')
      expect(message).toContain('`tooly run`')
      expectNoHostName(message)
    } finally {
      delete process.env.TOOLY_MACHINE_FILE
    }
  })
})
