import { z } from 'zod'

import { defineCommand } from '@osdlc/cli-tool/command'

/** `hello`, loaded from this file by `loadCommandTree`. */
export default defineCommand({
  summary: 'say hello',
  positionals: [{ name: 'name', help: 'who to greet' }],
  output: z.object({ greeting: z.string() }),
  run: ({ positionals }) => ({ greeting: `hello, ${positionals[0] ?? 'world'}` }),
  text: (o) => `${o.greeting}\n`,
})
