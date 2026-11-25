// Blocks for a review page built from screenshots: a measured pixel box
// becomes a region inside the image, and the blocks are plain objects.
import { expect, test } from 'vitest'

import {
  figure,
  finding,
  heading,
  idAllocator,
  parleyDocument,
  regionFromBox,
  slug,
  steps,
} from '@osdlc/story-harness/parley-capture'

test('a walk becomes a document with a figure, a slide show and a finding', () => {
  const next = idAllocator()
  const viewport = { width: 1000, height: 500 }
  const region = regionFromBox({ x: 100, y: 50, w: 200, h: 100 }, viewport, {
    id: 'save',
    title: 'Save',
  })
  const doc = parleyDocument({
    id: slug('Button walk'),
    title: 'Button walk',
    created: '2026-01-01',
    keep: true,
    blocks: [
      heading({ id: next('Button'), title: 'Button' }),
      figure({ id: next('Button map'), src: 'x/start.png', alt: 'The page', regions: [region] }),
      steps({
        id: next('Button stops'),
        frames: [
          { id: 'one', src: 'x/01.png', alt: 'Stop 1', regions: [region] },
          { id: 'two', src: 'x/02.png', alt: 'Stop 2' },
        ],
      }),
      finding({
        id: next('Button finding'),
        ref: 'button--primary',
        summary: 'No focus indicator',
        severity: 'should',
      }),
    ],
  })
  expect(region?.box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
  expect(doc.blocks.map((b) => b.type)).toEqual(['heading', 'figure', 'steps', 'finding'])
  expect(doc.keep).toBe(true)
})
