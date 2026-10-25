import { z } from 'zod'

import { defineCommand } from '../../../../src/command/index.ts'
import { VALUE } from './_value.ts'

export default defineCommand({
  summary: 'one value',
  output: z.object({ value: z.number() }),
  run: () => ({ value: VALUE }),
})
