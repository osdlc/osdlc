/**
 * The code the README shows, run. Each README snippet is a `// #region`
 * block here, and `tests/readme.test.ts` checks that the README holds the
 * block word for word. Edit the block, then paste it into the README.
 */

import { expect, test } from 'vitest'

// #region quick-start
import { configNeeds, envVars, machineConfigFile } from '@osdlc/config-layers'
import { z } from 'zod'

const ProjectSchema = z.object({
  upload: z
    .object({
      endpoint: z.string().default('').describe('The server that receives uploads.'),
    })
    .prefault({}),
})
const MachineSchema = z.object({ repos: z.array(z.string()).default([]) })

const machine = machineConfigFile({
  tool: 'tooly',
  schema: MachineSchema,
  vendorDirs: { vendor: 'com.example', envVars: envVars('TOOLY') },
})
const needs = configNeeds({
  tool: 'tooly',
  projectFile: 'app.yaml',
  projectSchema: ProjectSchema,
  machine,
  scaffoldHint: '`tooly config scaffold` shows the full shape',
})

const need = { config: 'upload.endpoint', unlessInput: 'endpoint' }
const project = ProjectSchema.parse({})
let message = ''
if (!needs.met(need, { project, input: {} })) {
  message = needs.message(need, { projectRoot: '/work/app', command: ['upload', 'run'] })
}
// `tooly upload run` needs `upload.endpoint`, and it is not set (or pass
// --endpoint). The server that receives uploads. Set it in an app.yaml at the
// project root (none above /work/app); `tooly config scaffold` shows the full
// shape.
// #endregion quick-start

test('the quick start prints the message the README shows', () => {
  expect(message).toBe(
    '`tooly upload run` needs `upload.endpoint`, and it is not set (or pass --endpoint). ' +
      'The server that receives uploads. Set it in an app.yaml at the project root ' +
      '(none above /work/app); `tooly config scaffold` shows the full shape.',
  )
})
