import { describe, expect, it } from 'vitest'
import { textSegments } from '../src/model/richText'

describe('textSegments', () => {
  it('splits out markdown links and inline code', () => {
    expect(textSegments('Rename: [osdlc#725](https://github.com/osdlc/osdlc/pull/725), see `SPEC.md`. Done.')).toEqual([
      { type: 'text', text: 'Rename: ' },
      { type: 'link', text: 'osdlc#725', url: 'https://github.com/osdlc/osdlc/pull/725' },
      { type: 'text', text: ', see ' },
      { type: 'code', text: 'SPEC.md' },
      { type: 'text', text: '. Done.' },
    ])
  })

  it('keeps a non-web link as its label and plain text as one piece', () => {
    expect(textSegments('A [local](docs/x.md) note')).toEqual([{ type: 'text', text: 'A local note' }])
    expect(textSegments('')).toEqual([])
  })
})
