/**
 * Tokenizer for Bases filter/formula expressions.
 */

/**
 * The kinds of token {@link tokenize} produces.
 *
 * @experimental The lexer is an implementation detail of `parseExpression`.
 */
export type TokenType =
  | 'STRING'
  | 'NUMBER'
  | 'IDENT'
  | 'REGEX' // /pattern/flags — value carries pattern + NUL + flags
  | 'OP' // == != > < >= <= && || ! + - * / %
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LBRACE'
  | 'RBRACE'
  | 'COLON'
  | 'DOT'
  | 'COMMA'
  | 'EOF'

/**
 * One lexer token.
 *
 * @experimental The lexer is an implementation detail of `parseExpression`.
 */
export interface Token {
  /** The kind of token. */
  type: TokenType
  /** The token text; a string token holds its unescaped contents. */
  value: string
  /** Offset of the token's first character in the input. */
  position: number
}

/** Thrown by `parseExpression` for a syntax error. The message names the position and the input. */
export class ExpressionError extends Error {
  /** Offset in `input` where the error was found. */
  position: number
  /** The expression text that failed to parse. */
  input: string

  constructor(message: string, position: number, input: string) {
    super(`${message} at position ${position} in "${input}"`)
    this.name = 'ExpressionError'
    this.position = position
    this.input = input
  }
}

const TWO_CHAR_OPS = ['==', '!=', '>=', '<=', '&&', '||']
const ONE_CHAR_OPS = new Set(['>', '<', '!', '+', '-', '*', '/', '%'])

const isDigit = (c: string): boolean => c >= '0' && c <= '9'
// Dashes are NOT identifier characters: `a-b` is subtraction. Properties with
// dashes/spaces are addressed via bracket syntax, e.g. note["foo-bar"].
const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c)
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_]/.test(c)

/**
 * Split an expression into tokens, ending with an `EOF` token. Throws {@link ExpressionError} on an
 * unterminated string or regex, or on an unexpected character.
 *
 * @experimental The lexer is an implementation detail of `parseExpression`.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  const peek = (offset = 0): string => input[pos + offset] ?? ''

  while (pos < input.length) {
    // peek() is input[pos]; the loop bound makes it a real character.
    const c = peek()

    if (/\s/.test(c)) {
      pos++
      continue
    }

    const start = pos

    const two = input.slice(pos, pos + 2)
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ type: 'OP', value: two, position: start })
      pos += 2
      continue
    }

    // `/` is a regex literal when in prefix position (start of expression or
    // after an operator/opening bracket/comma/colon); otherwise division.
    if (c === '/') {
      const prev = tokens[tokens.length - 1]
      const regexAllowed =
        !prev ||
        prev.type === 'OP' ||
        prev.type === 'LPAREN' ||
        prev.type === 'LBRACKET' ||
        prev.type === 'LBRACE' ||
        prev.type === 'COLON' ||
        prev.type === 'COMMA'
      if (regexAllowed) {
        pos++
        let pattern = ''
        let inClass = false
        while (pos < input.length && (input[pos] !== '/' || inClass)) {
          if (input[pos] === '\\') {
            pattern += input[pos] + (input[pos + 1] ?? '')
            pos += 2
            continue
          }
          if (input[pos] === '[') inClass = true
          if (input[pos] === ']') inClass = false
          pattern += input[pos]
          pos++
        }
        if (pos >= input.length)
          throw new ExpressionError('Unterminated regex literal', start, input)
        pos++ // closing '/'
        let flags = ''
        while (pos < input.length && /[a-z]/i.test(peek())) flags += input[pos++]
        tokens.push({ type: 'REGEX', value: `${pattern}\0${flags}`, position: start })
        continue
      }
    }

    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ type: 'OP', value: c, position: start })
      pos++
      continue
    }

    switch (c) {
      case '(':
        tokens.push({ type: 'LPAREN', value: c, position: start })
        pos++
        continue
      case ')':
        tokens.push({ type: 'RPAREN', value: c, position: start })
        pos++
        continue
      case '[':
        tokens.push({ type: 'LBRACKET', value: c, position: start })
        pos++
        continue
      case ']':
        tokens.push({ type: 'RBRACKET', value: c, position: start })
        pos++
        continue
      case '{':
        tokens.push({ type: 'LBRACE', value: c, position: start })
        pos++
        continue
      case '}':
        tokens.push({ type: 'RBRACE', value: c, position: start })
        pos++
        continue
      case ':':
        tokens.push({ type: 'COLON', value: c, position: start })
        pos++
        continue
      case ',':
        tokens.push({ type: 'COMMA', value: c, position: start })
        pos++
        continue
      case '.':
        // .5 is a number; anything else is member access.
        if (isDigit(peek(1))) break
        tokens.push({ type: 'DOT', value: c, position: start })
        pos++
        continue
    }

    if (c === '"' || c === "'") {
      pos++
      let value = ''
      while (pos < input.length && input[pos] !== c) {
        if (input[pos] === '\\') {
          pos++
          const escaped = input[pos] ?? ''
          value += escaped === 'n' ? '\n' : escaped === 't' ? '\t' : escaped
          pos++
        } else {
          value += input[pos]
          pos++
        }
      }
      if (pos >= input.length) throw new ExpressionError('Unterminated string', start, input)
      pos++ // closing quote
      tokens.push({ type: 'STRING', value, position: start })
      continue
    }

    if (isDigit(c) || (c === '.' && isDigit(peek(1)))) {
      let value = ''
      while (pos < input.length && isDigit(peek())) value += input[pos++]
      if (input[pos] === '.' && isDigit(peek(1))) {
        value += input[pos++]
        while (pos < input.length && isDigit(peek())) value += input[pos++]
      }
      tokens.push({ type: 'NUMBER', value, position: start })
      continue
    }

    if (isIdentStart(c)) {
      let value = ''
      while (pos < input.length && isIdentPart(peek())) value += input[pos++]
      tokens.push({ type: 'IDENT', value, position: start })
      continue
    }

    throw new ExpressionError(`Unexpected character "${c}"`, pos, input)
  }

  tokens.push({ type: 'EOF', value: '', position: pos })
  return tokens
}
