// Tests for package-shape.mjs.
//
//   node --test .github/scripts/package-shape.test.mjs
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  bunConditions,
  bunScripts,
  parseJsonc,
  shapeProblems,
  shippedSource,
  tsconfigProblems,
} from './package-shape.mjs'

const good = {
  pkg: {
    exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
    scripts: { build: 'tsc -p tsconfig.build.json', test: 'vitest run' },
    devDependencies: { vitest: '^5' },
  },
  packedFiles: ['dist/index.js', 'dist/index.d.ts', 'README.md', 'hosted.d.ts'],
  tsconfigs: { 'tsconfig.json': { compilerOptions: { paths: { '@x/self': ['./index.ts'] } } } },
}

test('a package in the shape has no problems', () => {
  assert.deepEqual(shapeProblems(good), [])
})

test('a bun export condition fails, at any depth', () => {
  assert.deepEqual(bunConditions({ '.': { bun: './index.ts', default: './dist/index.js' } }), [
    'exports["."].bun',
  ])
  assert.deepEqual(bunConditions({ bun: './index.ts', default: './dist/index.js' }), ['exports.bun'])
  assert.deepEqual(bunConditions('./dist/index.js'), [])
  assert.equal(shapeProblems({ ...good, pkg: { ...good.pkg, exports: { '.': { bun: './i.ts' } } } }).length, 1)
})

test('shipped TypeScript source fails, a .d.ts does not', () => {
  assert.deepEqual(shippedSource(['index.ts', 'src/a.mts', 'x.tsx', 'dist/a.d.ts', 'b.d.mts']), [
    'index.ts',
    'src/a.mts',
    'x.tsx',
  ])
  assert.equal(shapeProblems({ ...good, packedFiles: [...good.packedFiles, 'src/index.ts'] }).length, 1)
})

test('a script that invokes bun fails', () => {
  assert.deepEqual(bunScripts({ test: 'bun test', build: 'tsc', t2: 'tsc && bun run x', t3: 'bunx foo' }), [
    'test: bun test',
    't2: tsc && bun run x',
    't3: bunx foo',
  ])
  assert.deepEqual(bunScripts({ build: 'tsc', clean: 'rimraf bundle', smoke: 'node tests/smoke.mjs' }), [])
  const pkg = { ...good.pkg, scripts: { test: 'bun test && npm run test:node' } }
  assert.equal(shapeProblems({ ...good, pkg }).length, 1)
})

test('@types/bun fails', () => {
  const pkg = { ...good.pkg, devDependencies: { '@types/bun': '^1' } }
  assert.equal(shapeProblems({ ...good, pkg }).length, 1)
})

test('customConditions, a sibling path and bun types in a tsconfig fail', () => {
  assert.equal(tsconfigProblems('t.json', { compilerOptions: { customConditions: [] } }).length, 1)
  assert.equal(tsconfigProblems('t.json', { compilerOptions: { customConditions: null } }).length, 1)
  assert.equal(
    tsconfigProblems('t.json', { compilerOptions: { paths: { '@x/lib': ['../lib/index.ts'] } } }).length,
    1,
  )
  assert.equal(tsconfigProblems('t.json', { compilerOptions: { types: ['node', 'bun'] } }).length, 1)
  assert.deepEqual(tsconfigProblems('t.json', { compilerOptions: { types: ['node'] } }), [])
  assert.deepEqual(tsconfigProblems('t.json', {}), [])
})

test('parseJsonc reads comments, trailing commas and slashes in strings', () => {
  const text = `{
    // a line comment
    "a": "http://x", /* a block */
    "b": [1, 2,],
  }`
  assert.deepEqual(parseJsonc(text), { a: 'http://x', b: [1, 2] })
})
