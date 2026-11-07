import { describe, expect, test } from 'vitest'

import { redactPatternProblem } from '../src/redact-pattern.ts'

describe('redactPatternProblem', () => {
  test.each([
    '(a+)+$',
    '(a*)*',
    '(a+)*',
    '(a+){2,}',
    '(a|a)+',
    '(a|aa)*$',
    '(?:foo|foo)+x',
    '((a|a))+',
    '(\\w|\\d)+',
    '(a|)+',
    '(.*a){10}',
    '(x+x+)+y',
    '(a{1,2})+b',
    '(\\d{1,3},?)+x',
    '(?:[a-z]{1,8}\\.?)+@',
    '((ab){1,3})+c',
    '(\\d\\d?\\d?,?)+x',
    '(aa{0,1})+b',
    '(a?a?)+b',
    '(a{1,2}){20}b',
    '(\\w+)*',
    '(a|a?)+',
    '([a-z:]+:)*',
    '(?:[a-z]+[a-z]+-)+x',
    '(?:a?a?-)+x',
    '(?:(?:a|a)-)+x',
    '(?:.+-)+x',
    '(?:[^-]+-)+x',
    '(?:\\S+\\s)+x',
    '(?:[a-f]+-?)+x',
    '((?:[a-z]+-)+)+x',
    // Without `u` the engine matches UTF-16 code units: both classes hold `\uD83D`.
    '(?:[\u{1F601}]+[\u{1F600}])+x',
    // `(?i:` makes `[a-z]` match `Z` and `a` match `A`.
    '(?i:(?:[a-z]+Z)+)!',
    '(?i:a|A)+!',
    // An escape and the literal it stands for start alike.
    '(?:\\-|-)+!',
    '(?:\\x41|A)+!',
    // `[]` is an empty class, so `(a+)+` is not hidden inside a class.
    '(?:x|[])(a+)+]',
    '(?:x|[^])(a+)+]',
  ])('%s is refused', (regex) => {
    expect(redactPatternProblem(regex)).toContain('catastrophic')
  })

  test.each([
    'ghp_[A-Za-z0-9]{36}',
    '(?:ghp|gho)_[A-Za-z0-9]{36}',
    '(?:[a-z]+\\.){2}example',
    'a+b+c*',
    '[(]+[)]*',
    '\\(a+\\)+',
    '(abc)+',
    '(a|b)?c',
    '(a|b)+x\\d{3}',
    '(?:foo|bar)+',
    '((a|b))+',
    '(?<id>\\d+)-x',
    '\\d{1,3}(?:,\\d{3})+',
    '(a{2})+b',
    '(\\d{1,3}){2}',
    '(?:\\d{1,3}\\.){3}\\d{1,3}',
    '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}',
    '(?:[a-z]+-){3}[a-z]+',
    '(?:[a-z0-9]+\\.)+[a-z]{2,}',
    '(?:[\\w.-]+/)+',
    '(?:\\w+\\s)+x',
    '(?:[\u{1F601}]+\u{1F600})+x',
    '(?:a|b)+[]',
  ])('%s is accepted', (regex) => {
    expect(redactPatternProblem(regex)).toBeNull()
  })

  // Inline modifier groups compile only where the engine has them (V8 in Node 23 and later).
  const modifiersCompile = ((): boolean => {
    try {
      new RegExp('(?i:a)')
      return true
    } catch {
      return false
    }
  })()

  test('a modifier group is accepted where the engine compiles it, refused where it does not', () => {
    const problem = redactPatternProblem('(?i:secret)=\\w+')
    if (modifiersCompile) expect(problem).toBeNull()
    else expect(problem).toMatch(/Invalid/)
  })

  // Each pattern the separator rule accepts, against a long input built to make it
  // backtrack, then a short tail it matches. An unbounded repeat rescans from every
  // start position, so those inputs are shorter. The tail must still be redacted:
  // an engine with a backtrack limit gives up quickly and matches nothing.
  test.each([
    ['(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}', 'a:'.repeat(25_000), ' 1:2:3:4:5:6:7:8'],
    ['(?:\\d{1,3}\\.){3}\\d{1,3}', '1.'.repeat(25_000), ' 1.2.3.4'],
    ['(?:[a-z]+-){3}[a-z]+', 'a-'.repeat(25_000), ' b-c-d-e'],
    ['(?:[a-z0-9]+\\.)+[a-z]{2,}', 'a.'.repeat(2_500) + '!', ' b.cd'],
    ['(?:[\\w.-]+/)+!', 'a/'.repeat(2_500), ' b/!'],
    ['(?:\\w+\\s)+x', 'a '.repeat(2_500), '!b x'],
  ])('%s stays fast on a long adversarial input', (regex, input, tail) => {
    expect(redactPatternProblem(regex)).toBeNull()
    const started = performance.now()
    const out = (input + tail).replace(new RegExp(regex, 'g'), '<R>')
    expect(performance.now() - started).toBeLessThan(1000)
    expect(out.endsWith('<R>')).toBe(true)
  })

  test('a regex that does not compile is refused with the engine message', () => {
    expect(redactPatternProblem('(')).not.toBeNull()
  })
})
