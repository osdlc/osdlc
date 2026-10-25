import { z } from 'zod'

import { defineCommand } from '../../../../src/command/index.ts'

export default defineCommand({ summary: 'write a value', output: z.object({}), run: () => ({}) })
