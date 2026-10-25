/**
 * JSON with comments and trailing commas, the dialect VS Code's `tasks.json`,
 * devbox's `devbox.json` and Nx's `nx.json` and `project.json` accept.
 */

import { stripBom } from './shared.ts'

/**
 * Parse JSONC: `//` and `/* *\/` comments, and one trailing comma after a value
 * before `}` or `]`, outside strings. Throws a `SyntaxError` when the rest is
 * not JSON, for an unterminated block comment, and for a comma with no value
 * before it (`[,]`, `{,}`).
 */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(stripBom(text)))
}

/** `text` with comments and trailing commas removed, strings left alone. */
function stripJsonc(text: string): string {
  let out = ''
  // Where a comma waits to be written: dropped if the next token closes.
  let pendingComma = ''
  // The last character written that is not whitespace or a comment.
  let last = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]
    if (ch === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      out += pendingComma + text.slice(i, end + 1)
      pendingComma = ''
      last = '"'
      i = end
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) throw new SyntaxError('unterminated block comment')
      i = end + 1
      out += ' '
      continue
    }
    if (ch === ',') {
      if (last === '' || last === '[' || last === '{' || pendingComma !== '') {
        // No value before it: write it as is, so JSON.parse refuses it.
        out += pendingComma + ch
        pendingComma = ''
        last = ch
        continue
      }
      pendingComma = ','
      continue
    }
    if (/\s/.test(ch)) {
      if (pendingComma === '') out += ch
      else pendingComma += ch
      continue
    }
    if ((ch === '}' || ch === ']') && pendingComma !== '') {
      out += pendingComma.slice(1)
    } else {
      out += pendingComma
    }
    pendingComma = ''
    out += ch
    last = ch
  }
  return out + pendingComma
}

/**
 * Read `file` through `ctx` and parse it as JSONC. `null` when it cannot be
 * read (missing, outside the root, too large); `{ error }` when it does not
 * parse.
 */
export async function readJsonc(
  ctx: { readText(relPath: string): Promise<string | null> },
  file: string,
): Promise<{ value: unknown } | { error: string } | null> {
  const text = await ctx.readText(file)
  if (text === null) return null
  try {
    return { value: parseJsonc(text) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
