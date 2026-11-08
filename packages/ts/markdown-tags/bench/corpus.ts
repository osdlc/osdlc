/**
 * A deterministic synthetic note body for the benchmarks: prose with tags in
 * several shapes, code spans and fences, and links. No real content. The same
 * generator, with the same seed, is in the Rust crate's `benches/`.
 */

const WORDS = ['alpha', 'draft', 'plan', 'review', 'notes', 'santé', 'daily', 'idea', 'todo', 'log']

/** A small linear congruential generator, so every run builds the same body. */
function lcg(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** One paragraph of prose with tags; with `links`, inline and reference links too. */
function paragraph(next: () => number, links: boolean): string {
  const pick = () => WORDS[Math.floor(next() * WORDS.length)]!
  const parts: string[] = []
  for (let i = 0; i < 40; i++) {
    const roll = next()
    if (roll < 0.1) parts.push(`#${pick()}/${pick()}`)
    else if (roll < 0.15) parts.push(`(#${pick()})`)
    else if (roll < 0.18) parts.push(`#${2000 + Math.floor(next() * 30)}`)
    else if (roll < 0.22) parts.push(`\`#${pick()}\``)
    else if (links && roll < 0.28) parts.push(`[${pick()}](notes/${pick()}.md#${pick()})`)
    else if (links && roll < 0.3) parts.push(`[[${pick()}#${pick()}|${pick()}]]`)
    else parts.push(pick())
  }
  return parts.join(' ')
}

/** A note body of about `kilobytes` KB. */
export function noteBody(kilobytes: number, links: boolean, seed = 7): string {
  const next = lcg(seed)
  const blocks: string[] = []
  let size = 0
  while (size < kilobytes * 1000) {
    const block =
      next() < 0.12
        ? `\`\`\`ts\nconst tag = '#${WORDS[Math.floor(next() * WORDS.length)]}'\n\`\`\``
        : paragraph(next, links)
    blocks.push(block)
    size += block.length + 2
  }
  if (links) blocks.push('[ref]: notes/ref.md "title #in-title"')
  return blocks.join('\n\n') + '\n'
}
