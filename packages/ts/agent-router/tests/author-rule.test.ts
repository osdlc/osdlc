import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { authorRule, authorRuleFields } from '../src/author-rule.ts'

describe('authorRule', () => {
  test('unset keys take the defaults a profile used to: off, then different-model', () => {
    expect(authorRule({})).toEqual({ notTheAuthor: false, ifOnlyAuthorLeft: 'different-model' })
  })

  test('set keys are taken as written', () => {
    expect(authorRule({ not_the_author: true, if_only_author_left: 'person' })).toEqual({
      notTheAuthor: true,
      ifOnlyAuthorLeft: 'person',
    })
  })

  test('the fields refuse a value outside the enum', () => {
    const schema = z.strictObject(authorRuleFields)
    expect(schema.safeParse({ if_only_author_left: 'sometimes' }).success).toBe(false)
    expect(schema.safeParse({ not_the_author: 'yes' }).success).toBe(false)
  })
})
