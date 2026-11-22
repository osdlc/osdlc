/**
 * Recursive-descent parser for Bases expressions.
 *
 * Precedence (loosest to tightest):
 *   ||  →  &&  →  == !=  →  > < >= <=  →  + -  →  * / %  →  unary ! -  →
 *   postfix `.prop`, `.method(...)`, `[index]`  →  primary
 */

import type { BinaryOp, Expr } from './ast.ts'
import { ExpressionError, tokenize, type Token, type TokenType } from './lexer.ts'

class Parser {
  private current = 0
  private tokens: Token[]
  private input: string

  constructor(tokens: Token[], input: string) {
    this.tokens = tokens
    this.input = input
  }

  parse(): Expr {
    const expr = this.or()
    if (!this.isAtEnd()) {
      throw new ExpressionError(
        `Unexpected token "${this.peek().value}"`,
        this.peek().position,
        this.input,
      )
    }
    return expr
  }

  private or(): Expr {
    let left = this.and()
    while (this.matchOp('||')) {
      left = { kind: 'binary', op: '||', left, right: this.and() }
    }
    return left
  }

  private and(): Expr {
    let left = this.equality()
    while (this.matchOp('&&')) {
      left = { kind: 'binary', op: '&&', left, right: this.equality() }
    }
    return left
  }

  private equality(): Expr {
    let left = this.comparison()
    let op: BinaryOp | null
    while ((op = this.matchOps('==', '!='))) {
      left = { kind: 'binary', op, left, right: this.comparison() }
    }
    return left
  }

  private comparison(): Expr {
    let left = this.additive()
    let op: BinaryOp | null
    while ((op = this.matchOps('>', '<', '>=', '<='))) {
      left = { kind: 'binary', op, left, right: this.additive() }
    }
    return left
  }

  private additive(): Expr {
    let left = this.multiplicative()
    let op: BinaryOp | null
    while ((op = this.matchOps('+', '-'))) {
      left = { kind: 'binary', op, left, right: this.multiplicative() }
    }
    return left
  }

  private multiplicative(): Expr {
    let left = this.unary()
    let op: BinaryOp | null
    while ((op = this.matchOps('*', '/', '%'))) {
      left = { kind: 'binary', op, left, right: this.unary() }
    }
    return left
  }

  private unary(): Expr {
    if (this.matchOp('!')) return { kind: 'unary', op: '!', operand: this.unary() }
    if (this.matchOp('-')) return { kind: 'unary', op: '-', operand: this.unary() }
    return this.postfix()
  }

  private postfix(): Expr {
    let expr = this.primary()
    for (;;) {
      if (this.match('DOT')) {
        const name = this.consume('IDENT', 'Expected property or method name after "."').value
        if (this.match('LPAREN')) {
          expr = { kind: 'method', object: expr, name, args: this.args() }
        } else {
          expr = { kind: 'prop', object: expr, name }
        }
      } else if (this.match('LBRACKET')) {
        const index = this.or()
        this.consume('RBRACKET', 'Expected "]" after index')
        expr = { kind: 'index', object: expr, index }
      } else {
        return expr
      }
    }
  }

  private primary(): Expr {
    if (this.match('LPAREN')) {
      const expr = this.or()
      this.consume('RPAREN', 'Expected ")" after expression')
      return expr
    }

    const stringToken = this.match('STRING')
    if (stringToken) return { kind: 'literal', value: stringToken.value }
    const numberToken = this.match('NUMBER')
    if (numberToken) return { kind: 'literal', value: parseFloat(numberToken.value) }

    const regexToken = this.match('REGEX')
    if (regexToken) {
      const raw = regexToken.value
      const sep = raw.lastIndexOf('\0')
      return { kind: 'regex', pattern: raw.slice(0, sep), flags: raw.slice(sep + 1) }
    }

    // Object literal: {"key": expr, ...}
    if (this.match('LBRACE')) {
      const entries: Array<{ key: string; value: Expr }> = []
      if (!this.check('RBRACE')) {
        do {
          const keyToken = this.match('STRING') ?? this.match('IDENT')
          if (!keyToken)
            throw new ExpressionError('Expected object key', this.peek().position, this.input)
          this.consume('COLON', 'Expected ":" after object key')
          entries.push({ key: keyToken.value, value: this.or() })
        } while (this.match('COMMA'))
      }
      this.consume('RBRACE', 'Expected "}" after object literal')
      return { kind: 'object', entries }
    }

    // List literal (only valid in value position, e.g. `["a", "b"].contains(x)`)
    if (this.match('LBRACKET')) {
      const items: Expr[] = []
      if (!this.check('RBRACKET')) {
        do {
          items.push(this.or())
        } while (this.match('COMMA'))
      }
      this.consume('RBRACKET', 'Expected "]" after list literal')
      return { kind: 'list', items }
    }

    const identToken = this.match('IDENT')
    if (identToken) {
      const name = identToken.value
      if (name === 'true') return { kind: 'literal', value: true }
      if (name === 'false') return { kind: 'literal', value: false }
      if (name === 'null') return { kind: 'literal', value: null }
      if (this.match('LPAREN')) return { kind: 'call', name, args: this.args() }
      return { kind: 'ident', name }
    }

    throw new ExpressionError(
      `Unexpected token "${this.peek().value || 'end of input'}"`,
      this.peek().position,
      this.input,
    )
  }

  private args(): Expr[] {
    const args: Expr[] = []
    if (!this.check('RPAREN')) {
      do {
        args.push(this.or())
      } while (this.match('COMMA'))
    }
    this.consume('RPAREN', 'Expected ")" after arguments')
    return args
  }

  private matchOp(op: string): boolean {
    if (this.check('OP') && this.peek().value === op) {
      this.current++
      return true
    }
    return false
  }

  private matchOps(...ops: BinaryOp[]): BinaryOp | null {
    for (const op of ops) {
      if (this.matchOp(op)) return op
    }
    return null
  }

  /** Consume and return the next token when it has `type`; null otherwise. */
  private match(type: TokenType): Token | null {
    const token = this.peek()
    if (token.type !== type) return null
    this.current++
    return token
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type
  }

  private consume(type: TokenType, message: string): Token {
    const token = this.match(type)
    if (token) return token
    throw new ExpressionError(message, this.peek().position, this.input)
  }

  private peek(): Token {
    const token = this.tokens[this.current]
    // tokenize() always appends EOF and nothing consumes it, so `current`
    // never runs past the end. The guard is here rather than an assertion
    // because that invariant lives in another module.
    if (!token) throw new ExpressionError('Unexpected end of input', this.input.length, this.input)
    return token
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF'
  }
}

/**
 * Entries the memo table keeps. A .base file has a closed set of expressions,
 * but queryVault/queryExpression hand caller-supplied filter strings straight
 * through, so an unbounded table grows for the life of the process. The cap is
 * far above the expression count of any one view — evaluatePropertyId re-parses
 * per column per row, so a view's whole working set has to stay resident.
 */
const PARSE_CACHE_MAX = 1000
const cache = new Map<string, Expr>()

/**
 * Parse an expression string into an AST. Results are memoized in a bounded
 * least-recently-used table; a hot expression stays cached however many
 * one-off strings arrive alongside it. Throws {@link ExpressionError} on a syntax error.
 */
export function parseExpression(input: string): Expr {
  const cached = cache.get(input)
  if (cached) {
    // Re-insert to move the entry to the freshest end of the Map's order.
    cache.delete(input)
    cache.set(input, cached)
    return cached
  }
  const expr = new Parser(tokenize(input), input).parse()
  cache.set(input, expr)
  if (cache.size > PARSE_CACHE_MAX) {
    const stalest = cache.keys().next().value
    if (stalest !== undefined) cache.delete(stalest)
  }
  return expr
}

export { ExpressionError }
