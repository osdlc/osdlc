import { describe, expect, it } from 'vitest'

import { DeclarativeError } from '../../src/declarative/errors.js'
import { compileObjectSchemaV2, compileSchemaV2 } from '../../src/declarative/schema-v2.js'

describe('compileSchemaV2 — the JSON Schema subset → Zod', () => {
  it('an object with properties + required: required keys must be present', () => {
    const s = compileSchemaV2({
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' } },
      required: ['id'],
    })
    expect(s.safeParse({ id: 'D-0001', title: 'Hi' }).success).toBe(true)
    expect(s.safeParse({ id: 'D-0001' }).success).toBe(true) // title is optional-by-default
    expect(s.safeParse({ title: 'Hi' }).success).toBe(false) // id is required
  })

  it("optional-by-default — the JSON Schema inversion of v1's optional flag", () => {
    const s = compileSchemaV2({
      type: 'object',
      properties: { note: { type: 'string' } },
    })
    expect(s.safeParse({}).success).toBe(true)
    expect(s.safeParse({ note: 'x' }).success).toBe(true)
    expect(s.safeParse({ note: 1 }).success).toBe(false)
  })

  it('format COMPOSES with length/pattern constraints (v1 made format exclusive)', () => {
    const s = compileSchemaV2({
      type: 'string',
      format: 'email',
      maxLength: 20,
      pattern: '@example\\.com$',
    })
    expect(s.safeParse('a@example.com').success).toBe(true)
    expect(s.safeParse('a@other.com').success).toBe(false) // pattern
    expect(s.safeParse('very-long-address@example.com').success).toBe(false) // maxLength
    expect(s.safeParse('not an email').success).toBe(false) // format
  })

  it('[T, "null"] type union → nullable', () => {
    const s = compileSchemaV2({ type: ['string', 'null'] })
    expect(s.safeParse('x').success).toBe(true)
    expect(s.safeParse(null).success).toBe(true)
    expect(s.safeParse(1).success).toBe(false)
  })

  it('type: integer → whole numbers only, with minimum/maximum', () => {
    const s = compileSchemaV2({ type: 'integer', minimum: 0, maximum: 10 })
    expect(s.safeParse(5).success).toBe(true)
    expect(s.safeParse(5.5).success).toBe(false)
    expect(s.safeParse(11).success).toBe(false)
  })

  it('array: items + minItems / maxItems', () => {
    const s = compileSchemaV2({ type: 'array', items: { type: 'string' }, minItems: 1 })
    expect(s.safeParse(['x']).success).toBe(true)
    expect(s.safeParse([]).success).toBe(false)
    expect(s.safeParse([1]).success).toBe(false)
    const capped = compileSchemaV2({ type: 'array', items: { type: 'string' }, maxItems: 2 })
    expect(capped.safeParse(['a', 'b', 'c']).success).toBe(false)
  })

  it('string minLength / maxLength / pattern on a plain string', () => {
    const s = compileSchemaV2({ type: 'string', minLength: 1, pattern: '^T-[0-9A-Z]{4}$' })
    expect(s.safeParse('T-4QM9').success).toBe(true)
    expect(s.safeParse('nope').success).toBe(false)
    expect(s.safeParse('').success).toBe(false)
  })

  it('enum / const / boolean carry over from v1', () => {
    expect(compileSchemaV2({ enum: ['a', 'b'] }).safeParse('a').success).toBe(true)
    expect(compileSchemaV2({ enum: ['a', 'b'] }).safeParse('c').success).toBe(false)
    expect(compileSchemaV2({ const: 'task' }).safeParse('task').success).toBe(true)
    expect(compileSchemaV2({ const: 'task' }).safeParse('x').success).toBe(false)
    expect(compileSchemaV2({ type: 'boolean' }).safeParse(true).success).toBe(true)
  })

  it('default fills an absent value — including a non-required object property', () => {
    const s = compileSchemaV2({ type: 'string', default: 'draft' })
    expect(s.safeParse(undefined)).toMatchObject({ success: true, data: 'draft' })
    const o = compileSchemaV2({
      type: 'object',
      properties: { status: { type: 'string', default: 'draft' } },
    })
    expect(o.safeParse({})).toMatchObject({ success: true, data: { status: 'draft' } })
  })

  it('additionalProperties: false rejects unknown keys (strict object)', () => {
    const s = compileSchemaV2({
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    })
    expect(s.safeParse({ a: 'x' }).success).toBe(true)
    expect(s.safeParse({ a: 'x', b: 1 }).success).toBe(false)
  })

  it('description → .describe(), readable back off the compiled schema', () => {
    const s = compileSchemaV2({ type: 'string', description: 'the decision id' })
    expect(s.description).toBe('the decision id')
  })
})

describe('compileSchemaV2 — an invalid pattern', () => {
  it('throws a DeclarativeError naming the field, not a raw SyntaxError', () => {
    expect(() => compileSchemaV2({ type: 'string', pattern: '[' }, 'frontmatter.id')).toThrow(
      DeclarativeError,
    )
    expect(() => compileSchemaV2({ type: 'string', pattern: '[' }, 'frontmatter.id')).toThrow(
      /frontmatter\.id\.pattern is not a valid regular expression/,
    )
  })
})

describe('compileSchemaV2 — the three rejection dialects (closed vocabulary)', () => {
  it('a v1 spelling gets a migration hint naming the v2 form', () => {
    expect(() => compileSchemaV2({ type: 'object', fields: { a: { type: 'string' } } })).toThrow(
      /'fields' is the v1 spelling — v2 uses 'properties' \(markdown-contract migrate rewrites v1 files\)/,
    )
    expect(() =>
      compileSchemaV2({ type: 'array', of: { type: 'string' }, items: { type: 'string' } }),
    ).toThrow(/'of' is the v1 spelling — v2 uses 'items'/)
    expect(() => compileSchemaV2({ type: 'object', properties: {}, strict: true })).toThrow(
      /'strict' is the v1 spelling — v2 uses 'additionalProperties: false'/,
    )
    expect(() => compileSchemaV2({ type: 'number', int: true })).toThrow(
      /'int' is the v1 spelling — v2 uses 'type: integer'/,
    )
    expect(() => compileSchemaV2({ type: 'string', nullable: true })).toThrow(
      /'nullable' is the v1 spelling/,
    )
    expect(() => compileSchemaV2({ type: 'string', optional: true })).toThrow(
      /'optional' is the v1 spelling — v2 uses omission from 'required'/,
    )
    expect(() => compileSchemaV2({ type: 'string', min: 1 })).toThrow(
      /'min' is the v1 spelling — v2 uses 'minLength' \/ 'minimum' \/ 'minItems'/,
    )
    expect(() => compileSchemaV2({ type: 'string', max: 3 })).toThrow(/'max' is the v1 spelling/)
  })

  it('recognized JSON Schema outside the subset says so', () => {
    expect(() => compileSchemaV2({ type: 'string', $ref: '#/x' })).toThrow(
      /'\$ref' is JSON Schema outside the supported v2 subset/,
    )
    expect(() =>
      compileSchemaV2({ type: 'object', properties: {}, patternProperties: {} }),
    ).toThrow(/'patternProperties' is JSON Schema outside the supported v2 subset/)
    expect(() => compileSchemaV2({ type: 'number', multipleOf: 2 })).toThrow(
      /'multipleOf' is JSON Schema outside the supported v2 subset/,
    )
    expect(() => compileSchemaV2({ type: 'string', title: 'x' })).toThrow(
      /'title' is JSON Schema outside the supported v2 subset/,
    )
  })

  it('anything else is an unknown key, with a did-you-mean within edit distance 1–2', () => {
    expect(() => compileSchemaV2({ type: 'string', pattren: '^x$' })).toThrow(
      /unknown key 'pattren' \(did you mean 'pattern'\?\)/,
    )
    expect(() => compileSchemaV2({ type: 'string', frobnicate: 1 })).toThrow(
      /unknown key 'frobnicate'$/,
    )
  })

  it('keys are checked against the NODE SHAPE — minLength on a number is unknown there', () => {
    expect(() => compileSchemaV2({ type: 'number', minLength: 1 })).toThrow(
      /unknown key 'minLength'/,
    )
  })

  it('a const value must be a string, number, or boolean (v1 blindly cast)', () => {
    expect(() => compileSchemaV2({ const: { deep: 1 } })).toThrow(
      /const must be a string, number, or boolean \(got object\)/,
    )
    expect(() => compileSchemaV2({ const: null })).toThrow(/got null/)
    expect(compileSchemaV2({ const: 3 }).safeParse(3).success).toBe(true)
  })

  it('exactly one of type / enum / const', () => {
    expect(() => compileSchemaV2({})).toThrow(/needs exactly one of type \/ enum \/ const/)
    expect(() => compileSchemaV2({ type: 'string', enum: ['a'] })).toThrow(
      /needs exactly one of type \/ enum \/ const \(got type \+ enum\)/,
    )
  })

  it('only a [T, "null"] two-element union is inside the subset', () => {
    expect(() => compileSchemaV2({ type: ['string', 'number'] })).toThrow(
      /outside the supported v2 subset/,
    )
    expect(() => compileSchemaV2({ type: ['string', 'number', 'null'] })).toThrow(
      /outside the supported v2 subset/,
    )
    // either order is fine
    expect(compileSchemaV2({ type: ['null', 'integer'] }).safeParse(null).success).toBe(true)
  })

  it('required must name declared properties', () => {
    expect(() =>
      compileSchemaV2({ type: 'object', properties: { a: { type: 'string' } }, required: ['b'] }),
    ).toThrow(/required names 'b', which is not declared in properties/)
  })

  it('an array schema needs items; an object schema needs properties', () => {
    expect(() => compileSchemaV2({ type: 'array' })).toThrow(/needs an 'items' element schema/)
    expect(() => compileSchemaV2({ type: 'object' })).toThrow(/needs a 'properties' map/)
  })

  it('additionalProperties must be a boolean (the schema form is outside the subset)', () => {
    expect(() =>
      compileSchemaV2({ type: 'object', properties: {}, additionalProperties: {} }),
    ).toThrow(/additionalProperties must be a boolean/)
  })

  it('names the offending shape — null, a list, an unsupported type, a bad format', () => {
    expect(() => compileSchemaV2(null)).toThrow(/got null/)
    expect(() => compileSchemaV2([1])).toThrow(/got a list/)
    expect(() => compileSchemaV2({ type: 'date-ish' })).toThrow(/unsupported type 'date-ish'/)
    expect(() => compileSchemaV2({ type: 'string', format: 'iban' })).toThrow(
      /unsupported string format 'iban'/,
    )
  })
})

describe('compileObjectSchemaV2 — the frontmatter root', () => {
  it('compiles an explicit type: object node', () => {
    const s = compileObjectSchemaV2({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    })
    expect(s.safeParse({ id: 'x' }).success).toBe(true)
    expect(s.safeParse({}).success).toBe(false)
  })

  it('rejects anything else — v2 frontmatter is an object schema', () => {
    expect(() => compileObjectSchemaV2({ properties: {} })).toThrow(
      /a v2 frontmatter is an object schema/,
    )
    expect(() => compileObjectSchemaV2({ strict: true, fields: {} })).toThrow(DeclarativeError)
    expect(() => compileObjectSchemaV2({ type: 'string' })).toThrow(/explicit 'type: object'/)
  })
})
