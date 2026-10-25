/**
 * JSON with comments and trailing commas, the dialect VS Code's `tasks.json`
 * and devbox's `devbox.json` accept.
 */

/**
 * Parse JSONC: `//` and `/* *\/` comments, and a trailing comma before `}` or
 * `]`, outside strings. Throws a `SyntaxError` when the rest is not JSON.
 */
export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text.replace(/^﻿/, '')))
}

/** `text` with comments and trailing commas removed, strings left alone. */
function stripJsonc(text: string): string {
  let out = ''
  // Where a comma waits to be written: dropped if the next token closes.
  let pendingComma = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]
    if (ch === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      out += pendingComma + text.slice(i, end + 1)
      pendingComma = ''
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
      i = end === -1 ? text.length : end + 1
      out += ' '
      continue
    }
    if (ch === ',') {
      out += pendingComma
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
  }
  return out + pendingComma
}
