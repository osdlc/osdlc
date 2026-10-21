/**
 * Shared fixtures: a temp root, directories rooted under it, and a fake tool
 * (`tooly`) with its config vocabulary, its file names, a project schema and a
 * machine schema that overlap on `paths`. The machine schema is strict at
 * every level.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { envVars, systemDirs, type TieredDirs, type VendorDirs } from '../dirs.ts'

import { machineConfigFile, type MachineConfigFile } from '../machine.ts'
import type { ConfigKeyMeta } from '../meta.ts'
import { configNeeds, type ConfigNeeds } from '../needs.ts'
import { defineConfigVocabulary, type TermsOf } from '../vocabulary.ts'

export const TOOL = 'tooly'
export const PROJECT_FILE = 'tooly.yaml'
export const LOCAL_FILE = 'tooly.local.yaml'
/** The project file and the variable that relocates it. */
export const CONFIG_FILE = { name: PROJECT_FILE, envVar: 'TOOLY_CONFIG' } as const

/** The fake tool's meta vocabulary. */
export const vocabulary = defineConfigVocabulary({
  categories: ['core', 'extras'],
  appliers: ['shims'],
  layers: ['project', 'local', 'machine'],
  runContexts: ['cli', 'daemon'],
  enforcement: {
    levels: ['strict', 'applied', 'soft', 'reserved'],
    reserved: 'reserved',
    applied: 'applied',
  },
})

/** The vocabulary's term types. */
export type ToolyTerms = TermsOf<
  'core' | 'extras',
  'shims',
  'project' | 'local' | 'machine',
  'cli' | 'daemon',
  'strict' | 'applied' | 'soft' | 'reserved'
>

/** A valid meta block in the fake vocabulary: a project-and-local key read at run time. */
export const META: ConfigKeyMeta<ToolyTerms> = {
  category: 'core',
  consumers: ['meta.ts#readConfigMeta'],
  layers: ['project', 'local'],
  applies_via: 'read',
  enforcement: 'soft',
  runs_in: ['cli'],
}
export const VENDOR_DIRS: VendorDirs = { vendor: 'com.example', envVars: envVars('TOOLY') }

export const ProjectSchema = z
  .object({
    authority: z
      .string()
      .default('')
      .describe('The remote server the tool talks to. Empty means none.'),
    paths: z
      .record(z.string(), z.string())
      .default({})
      .describe('Named directories, referred to as `{name}`. Machine entries win.'),
    checkout: z
      .object({
        layout: z.string().default('{dev}/{repo}').describe('Where a checkout lands.'),
      })
      .prefault({}),
  })
  .strict()

export const MachineSchema = z
  .object({
    repos: z.array(z.string()).default([]).describe('Directories that hold checkouts.'),
    paths: z.record(z.string(), z.string()).default({}).describe('Named directories here.'),
    checkout: z
      .object({
        layout: z.string().optional().describe('Overrides the project layout.'),
        protocol: z.enum(['https', 'ssh']).optional(),
      })
      .strict()
      .prefault({}),
    trust: z
      .object({
        paths: z.array(z.string()).default([]),
        owners: z.array(z.string()).default([]),
      })
      .strict()
      .prefault({}),
  })
  .strict()

export interface Sandbox {
  root: string
  home: string
  dirs: TieredDirs
  machine: MachineConfigFile<typeof MachineSchema>
  needs: ConfigNeeds
  /** A fresh project dir under the root. */
  project(name: string): string
  dispose(): void
}

export function sandbox(): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'toolconfig-')))
  const home = join(root, 'home')
  mkdirSync(home, { recursive: true })
  const dirs = systemDirs(VENDOR_DIRS, { home, env: {} })
  const machine = machineConfigFile({
    tool: TOOL,
    schema: MachineSchema,
    vendorDirs: VENDOR_DIRS,
    dirs: () => dirs,
  })
  const needs = configNeeds({
    tool: TOOL,
    projectFile: PROJECT_FILE,
    projectSchema: ProjectSchema,
    machine,
    scaffoldHint: '`tooly config scaffold` shows the full shape',
  })
  return {
    root,
    home,
    dirs,
    machine,
    needs,
    project(name) {
      const dir = join(root, name)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    dispose() {
      delete process.env[machine.env]
      rmSync(root, { recursive: true, force: true })
    },
  }
}
