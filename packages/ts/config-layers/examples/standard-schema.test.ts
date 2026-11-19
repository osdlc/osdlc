/**
 * The Standard Schema code the README shows, run. A machine file reads through
 * any validator that implements the spec; this one is hand-written, so the
 * example needs no validator library.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  envVars,
  machineConfigFile,
  validateStandard,
  type StandardIssue,
  type StandardSchemaV1,
  type StandardValidation,
} from '@osdlc/config-layers'

// #region standard-schema
interface Machine {
  editor: string
}

const machineSchema: StandardSchemaV1<unknown, Machine> = {
  '~standard': {
    version: 1,
    vendor: 'hand-written',
    validate: (value) => {
      const editor = (value as { editor?: unknown }).editor ?? 'vi'
      return typeof editor === 'string'
        ? { value: { editor } }
        : { issues: [{ message: 'must be a string', path: ['editor'] }] }
    },
  },
}

const machine = machineConfigFile({
  tool: 'tooly',
  schema: machineSchema,
  vendorDirs: { vendor: 'osdlc', envVars: envVars('osdlc') },
})
// machine.load() is a Machine: a section that fails takes its default.

const checked: StandardValidation<Machine> = validateStandard(machineSchema, { editor: 3 })
const issues: StandardIssue[] = checked.ok ? [] : checked.issues
// issues is [{ path: ['editor'], message: 'must be a string' }]
// #endregion standard-schema

const dir = mkdtempSync(join(tmpdir(), 'cl-standard-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

test('a hand-written validator reads the machine file', () => {
  const file = join(dir, 'config.yaml')
  process.env[machine.env] = file
  writeFileSync(file, 'editor: nano\n')
  expect(machine.load()).toEqual({ editor: 'nano' })
  writeFileSync(file, 'editor: 3\n')
  machine.clearCache()
  expect(machine.load()).toEqual({ editor: 'vi' })
  expect(issues).toEqual([{ path: ['editor'], message: 'must be a string' }])
})
