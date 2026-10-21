import { describe, expect, test } from 'vitest'

import { formatPreview } from '../../src/update/confirm.ts'

describe('formatPreview', () => {
  test('lists the commits and the diffstat', () => {
    const text = formatPreview({
      number: 3,
      head: 'topic',
      base: 'main',
      commits: ['abc1234 two', 'def5678 one'],
      replaced: 2,
      diffstat: ' a.txt | 1 +\n 1 file changed, 1 insertion(+)',
    })
    expect(text).toBe(
      '#3  topic onto main\n' +
        '2 commit(s) to push, replacing 2:\n' +
        '  abc1234 two\n' +
        '  def5678 one\n' +
        ' a.txt | 1 +\n 1 file changed, 1 insertion(+)\n',
    )
  })
})
