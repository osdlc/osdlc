/**
 * `guide [topic]`, the same in every tool: long-form Markdown for a person or
 * a model who has the binary and not the README. The topics are data, so the
 * command can list them, print one, print all, or answer as JSON.
 */

import { z } from 'zod'

import { UsageError, commandKit, type CommandContext, type DataCommand } from './command/index.ts'
import type { FlagSpec } from './define-cli.ts'
import { safe } from './safe.ts'

/**
 * One topic of a guide.
 * @experimental
 */
export interface GuideTopic {
  /** The word that selects it: `guide config`. Lowercase, no spaces. */
  id: string
  title: string
  /** One line, for the topic list. */
  summary: string
  /** The Markdown body, without the title. Built when asked for, so it can read live data. */
  body(ctx: CommandContext): string
}

/**
 * The `guide` command's output.
 * @experimental
 */
export const GuideOutputSchema = z.object({
  /** The topic asked for, or null for the whole guide or the list. */
  topic: z.string().nullable(),
  topics: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string(),
      /** Absent in the topic list. */
      body: z.string().optional(),
    }),
  ),
})

/**
 * Options for {@link guideCommand}.
 * @experimental
 */
export interface GuideOptions<G extends FlagSpec> {
  /** The guide's title, the first line of the whole document. */
  title: string
  /** A paragraph under the title. */
  intro?: string
  globals?: G
}

/**
 * The `guide` command over `topics`.
 *
 * | Command line | Prints |
 * |---|---|
 * | `guide` | every topic, in order, under the title |
 * | `guide topics` | the topic ids and summaries |
 * | `guide <topic>` | one topic |
 *
 * An unknown topic is a usage error (exit 2) that lists the topics. Under
 * `--json` the output is `{ topic, topics }`, with each body except in the list.
 * @experimental
 */
export function guideCommand<G extends FlagSpec = Record<never, never>>(
  topics: readonly GuideTopic[],
  options: GuideOptions<G>,
): DataCommand {
  const ids = topics.map((t) => t.id)
  for (const id of ids) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`guideCommand: bad topic id '${id}'`)
    if (id === 'topics') throw new Error("guideCommand: 'topics' is reserved")
  }
  if (new Set(ids).size !== ids.length) throw new Error('guideCommand: duplicate topic id')
  const kit = commandKit({ globals: options.globals ?? ({} as G) })

  return kit.command({
    summary: 'how to use and extend this tool, in Markdown',
    description: `Topics: ${ids.join(', ')}. "guide topics" lists them with a line each.`,
    positionals: [{ name: 'topic', help: `one of: topics, ${ids.join(', ')}` }],
    output: GuideOutputSchema,
    kind: 'guide',
    readOnly: true,
    run({ positionals }, ctx) {
      if (positionals.length > 1) throw new UsageError('guide takes at most one topic')
      const which = positionals[0]
      const full = (t: GuideTopic) => ({
        id: t.id,
        title: t.title,
        summary: t.summary,
        body: t.body(ctx),
      })
      if (which === undefined) return { topic: null, topics: topics.map(full) }
      if (which === 'topics') {
        return {
          topic: null,
          topics: topics.map(({ id, title, summary }) => ({ id, title, summary })),
        }
      }
      const topic = topics.find((t) => t.id === which)
      if (topic === undefined) {
        throw new UsageError(`unknown topic '${which}'; topics are: topics, ${ids.join(', ')}`)
      }
      return { topic: topic.id, topics: [full(topic)] }
    },
    // A body can read live data, so controls are removed from the whole text.
    text: (output) => safe(guideText(output)),
  }) as DataCommand

  function guideText(output: z.infer<typeof GuideOutputSchema>): string {
    const section = (t: { title: string; body?: string | undefined }): string =>
      `## ${t.title}\n\n${(t.body ?? '').trim()}\n`
    if (output.topic !== null) return section(output.topics[0]!)
    if (output.topics.every((t) => t.body === undefined)) {
      const w = Math.max(...output.topics.map((t) => t.id.length))
      return output.topics.map((t) => `${t.id.padEnd(w)}  ${t.summary}\n`).join('')
    }
    const head = `# ${options.title}\n\n${options.intro !== undefined ? `${options.intro.trim()}\n\n` : ''}`
    return head + output.topics.map(section).join('\n')
  }
}
