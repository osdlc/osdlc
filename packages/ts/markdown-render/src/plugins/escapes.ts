/**
 * Backslash escapes, kept intact through the dialect passes.
 *
 * CommonMark resolves `\[` to `[` while parsing, so by the time a dialect
 * plugin re-tokenizes a `text` node the escape is gone and `\[\[Note]]` reads
 * exactly like `[[Note]]`. Every dialect tokenizer then activates on syntax the
 * author asked to be literal: a live wikilink, a live tag, a `==mark==`, an
 * embed, a block id that deletes the text before it.
 *
 * The dialect consumes remark's parse (D-7VMX), so the fix is a
 * `mdast-util-from-markdown` extension rather than a pre-parser: when the
 * parser emits an escaped character the dialect cares about, it wraps it in a
 * sentinel. The character itself is untouched; what changes is that it is no
 * longer adjacent to its neighbours, and every dialect tokenizer keys on
 * adjacency — `[[`, `%%`, `==`, a `#` or `^` after whitespace.
 * {@link remarkUnescape} deletes the sentinels once the last tokenizer has run,
 * so nothing downstream — heading slugs, `data-line`, rehype, the sanitizer,
 * the Vue walker — ever sees one.
 *
 * Both sides, not just the leading one: in `\==mark==` only the first `=` is
 * escaped, and a sentinel in front of it still leaves it touching the literal
 * `=` that follows. Sentinels rather than substitute characters, because a
 * substitute has to be mapped back and mapping back rewrites any character in
 * the substitute's range that the note itself contained. Deleting one code
 * point costs a note that types U+E000 that character, and nothing else.
 *
 * Fields that carry escaped source but are never re-tokenized (a link
 * destination, a fence's language) are restored immediately instead, by
 * {@link remarkEscapes}' own transformer: `resolveLink` is host code and must
 * be handed the author's URL, not a sentinel. Wikilink and embed targets are
 * still text when they are resolved, so those passes unmask the target they
 * hand the resolver.
 */

import { visit } from 'unist-util-visit'
import type { MdNode } from './util.ts'

/**
 * The sentinel: a private-use code point, so no note is likely to hold one and
 * no tokenizer treats it as whitespace, a delimiter or a word character.
 */
export const SENTINEL = '\uE000'

const SENTINELS = /\uE000/g

/**
 * Characters worth masking: the ones a dialect tokenizer keys on. For
 * everything else — `*`, `_`, `` ` ``, `<` — remark has already honoured the
 * escape by the time it emits the character, so masking would add nothing and
 * only widen the blast radius.
 *
 * `|` is deliberately absent. In a GFM table `\|` is how you write a pipe in a
 * cell, and `| [[Note\|alias]] |` is how Obsidian users write an aliased
 * wikilink there — masking it would turn the alias into part of the target.
 */
const MASKED = new Set(['[', ']', '#', '=', '!', '%', '^'])

/** One escaped character, wrapped in sentinels where it needs them. */
export function maskEscaped(char: string): string {
  return MASKED.has(char) ? SENTINEL + char + SENTINEL : char
}

/** Drop every sentinel, leaving the characters they were protecting. */
export function unmaskEscaped(value: string): string {
  return value.includes(SENTINEL) ? value.replace(SENTINELS, '') : value
}

/**
 * Fields holding parsed-but-not-re-tokenized source. Restored up front, before
 * any dialect plugin reads them.
 */
const RESTORE_EARLY = ['url', 'title', 'alt', 'label', 'identifier', 'lang', 'meta'] as const

/**
 * Replaces `mdast-util-from-markdown`'s own `characterEscapeValue` handler,
 * which appends the escaped character to the open text node. Same bookkeeping,
 * sentinels around the character.
 */
function onExitCharacterEscapeValue(this: CompileContext, token: EscapeToken): void {
  const tail = this.stack.pop()
  if (!tail) return
  tail.value = `${tail.value ?? ''}${maskEscaped(this.sliceSerialize(token))}`
  if (tail.position) {
    tail.position.end = { ...token.end }
  }
}

interface EscapeToken {
  end: { line: number; column: number; offset?: number }
}

interface CompileContext {
  stack: Array<{ value?: string; position?: { end: unknown } }>
  sliceSerialize: (token: EscapeToken) => string
}

interface ParserData {
  fromMarkdownExtensions?: unknown[]
}

/**
 * Mask escaped characters at parse time, and restore the fields no dialect
 * plugin re-tokenizes. Must be `use`d before the dialect plugins, and paired
 * with {@link remarkUnescape} after the last of them.
 */
export function remarkEscapes(this: { data: () => ParserData }) {
  const data = this.data()
  ;(data.fromMarkdownExtensions ??= []).push({
    exit: { characterEscapeValue: onExitCharacterEscapeValue },
  })

  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      for (const field of RESTORE_EARLY) {
        const value = node[field]
        if (typeof value === 'string') node[field] = unmaskEscaped(value)
      }
    })
  }
}

/**
 * Restore every masked character. Runs after the last plugin that re-tokenizes
 * text, and before heading ids are slugged from it.
 */
export function remarkUnescape() {
  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      if (typeof node.value === 'string') node.value = unmaskEscaped(node.value)
      const properties = node.data?.hProperties
      if (!properties) return
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string') properties[key] = unmaskEscaped(value)
      }
    })
  }
}
