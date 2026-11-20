/**
 * The field walker code the README shows, run. `tests/readme.test.ts` checks
 * that the README holds each `// #region` block word for word.
 */

import { expect, test } from 'vitest'
import { z } from 'zod'

import {
  configFields,
  defaultControl,
  type ConfigField,
  type FieldMeta,
} from '@osdlc/config-layers'

// #region fields
const editorMeta: FieldMeta = { label: 'Editor', control: 'path' }

const shape = {
  editor: z.string().default('vi').describe('The editor to open.').meta(editorMeta),
  server: z.object({
    port: z.number().default(8080).describe('The port to listen on.'),
    mode: z.enum(['dev', 'prod']).default('dev'),
    token: z.string().optional().meta({ hidden: true }),
  }),
}

const fields: ConfigField[] = configFields(shape)
const visible = fields.filter((f) => !f.hidden)
// visible.map((f) => [f.key, f.control]) is
//   [['editor', 'path'], ['server.port', 'number'], ['server.mode', 'select']]
// #endregion fields

test('configFields lists the leaves with their meta and defaults', () => {
  expect(visible.map((f) => [f.key, f.control])).toEqual([
    ['editor', 'path'],
    ['server.port', 'number'],
    ['server.mode', 'select'],
  ])
  expect(fields.find((f) => f.key === 'server.mode')?.choices).toEqual(['dev', 'prod'])
  expect(fields.find((f) => f.key === 'editor')?.label).toBe('Editor')
  expect(defaultControl('boolean')).toBe('toggle')
})
