/**
 * The tool example the `extend` guide section prints, as real TypeScript, so
 * the typechecker compiles it. `guide.test.ts` checks it matches
 * `EXTEND_EXAMPLE` in `../src/guide.ts` between the markers. Edit both
 * together.
 */

// GUIDE-EXAMPLE-START
import type { ToolDef } from '@osdlc/system-model/detect'

export const tools: ToolDef[] = [
  {
    id: 'acme',
    binary: 'acme',
    markers: [{ files: '/acme.json', tier: 'files' }],
    roles: {
      runner: {
        kind: 'parse',
        chain: [{ label: 'task', hint: 'the acme task to run' }],
        async collect(ctx) {
          const config = (await ctx.readJson('acme.json')) as { tasks?: string[] } | null
          const tasks = (config?.tasks ?? []).map((name) => ({
            id: `acme:${name}`,
            runner: 'acme',
            path: ['acme', name],
            argv: ['acme', 'run', name],
            cwd: '.',
            display: `acme run ${name}`,
            parameters: [],
            source: 'acme.json',
            origin: 'declared' as const,
            tags: [],
            persistent: { value: false, declared: false },
            executes: 'local' as const,
          }))
          return { status: 'ok', tasks, diagnostics: [] }
        },
      },
    },
  },
]
// GUIDE-EXAMPLE-END
