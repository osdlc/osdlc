// Tests for package-shape.mjs.
//
//   node --test .github/scripts/package-shape.test.mjs
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  authorProblems,
  bunConditions,
  bunScripts,
  catalogProblems,
  changelogProblems,
  configPackageProblems,
  conventionProblems,
  docsProblems,
  enginesProblems,
  gitignoreProblems,
  layoutProblems,
  packedManifestProblems,
  parseCatalog,
  parseJsonc,
  readmeProblems,
  scriptProblems,
  section,
  shapeProblems,
  shippedSource,
  shippedSourceMaps,
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

test('a shipped source map fails', () => {
  assert.deepEqual(shippedSourceMaps(['dist/a.js', 'dist/a.d.ts', 'dist/a.d.ts.map', 'dist/a.js.map']), [
    'dist/a.d.ts.map',
    'dist/a.js.map',
  ])
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

// ---------------------------------------------------------------------------
// Conventions

const README = `# @osdlc/app

## Install

\`\`\`sh
npm install @osdlc/app
\`\`\`

## Licence

\`MIT OR Apache-2.0\`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
`

const FILES = [
  'src/index.ts',
  'tests/smoke.mjs',
  'tests/index.test.ts',
  'examples/readme.test.ts',
  'vitest.config.ts',
  'docs/planning/README.md',
  'docs/planning/decisions/D-01.md',
  'README.md',
]

const code = {
  dir: 'app',
  pkg: {
    name: '@osdlc/app',
    author: 'sksizer',
    engines: { node: '>=22' },
    dependencies: { '@osdlc/lib': 'workspace:^' },
    devDependencies: { vitest: 'catalog:' },
    scripts: {
      typecheck: 'tsc --noEmit && tsc -p tsconfig.build.json --noEmit',
      smoke: 'node tests/smoke.mjs',
    },
  },
  files: FILES,
  tsconfigs: { 'tsconfig.build.json': { compilerOptions: { rootDir: 'src' }, include: ['src'] } },
  readme: README,
  changelog: '# @osdlc/app\n\n## 1.0.0\n',
  gitignore: 'node_modules/\ndist/\ncoverage/\n',
  catalog: { vitest: '^5.0.5' },
  engines: { '@osdlc/lib': '>=22' },
}

test('a code package that keeps the conventions has no problems', () => {
  assert.deepEqual(conventionProblems(code), [])
})

test('P1: the author must be sksizer', () => {
  assert.deepEqual(authorProblems({ author: 'sksizer' }), [])
  assert.equal(authorProblems({ author: 'SK Sizer' }).length, 1)
  assert.equal(authorProblems({}).length, 1)
})

test('P2: engines.node is a subset of >=22 and of every workspace dependency', () => {
  const typedGit = '^22.22.2 || ^24.15.0 || >=26.0.0'
  assert.deepEqual(enginesProblems({ engines: { node: '>=22' } }, {}), [])
  assert.deepEqual(enginesProblems({ engines: { node: typedGit } }, {}), [])
  assert.equal(enginesProblems({}, {}).length, 1, 'missing')
  assert.equal(enginesProblems({ engines: { node: '>=20' } }, {}).length, 1, 'wider than the base')
  const dependent = { engines: { node: '>=22' }, dependencies: { '@osdlc/typed-git': 'workspace:^' } }
  const [problem] = enginesProblems(dependent, { '@osdlc/typed-git': typedGit })
  assert.match(problem, /wider than @osdlc\/typed-git's/)
  assert.match(problem, /set it to \^22\.22\.2/)
  assert.deepEqual(
    enginesProblems({ ...dependent, engines: { node: typedGit } }, { '@osdlc/typed-git': typedGit }),
    [],
  )
  // A peer or optional dependency counts too; a third-party one has no entry.
  const peer = { engines: { node: '>=22' }, peerDependencies: { '@osdlc/typed-git': '^0' } }
  assert.equal(enginesProblems(peer, { '@osdlc/typed-git': typedGit }).length, 1)
  assert.deepEqual(enginesProblems({ engines: { node: '>=22' }, dependencies: { zod: '1' } }, {}), [])
})

test('P3 and P4: the typecheck and smoke scripts, and the smoke file', () => {
  assert.deepEqual(scriptProblems(code.pkg, FILES), [])
  const noBuild = { ...code.pkg, scripts: { ...code.pkg.scripts, typecheck: 'tsc --noEmit' } }
  assert.match(scriptProblems(noBuild, FILES)[0], /scripts\.typecheck/)
  const noScript = { ...code.pkg, scripts: { typecheck: code.pkg.scripts.typecheck } }
  assert.match(scriptProblems(noScript, FILES)[0], /scripts\.smoke/)
  assert.match(scriptProblems(code.pkg, ['src/index.ts'])[0], /tests\/smoke\.mjs is missing/)
})

test('P5: TypeScript at the package root, and a build that does not root at src, fail', () => {
  assert.deepEqual(layoutProblems(FILES, code.tsconfigs), [])
  assert.deepEqual(layoutProblems([...FILES, 'vitest.config.ts'], code.tsconfigs), [])
  assert.match(layoutProblems([...FILES, 'index.ts'], code.tsconfigs)[0], /index\.ts sits at the package root/)
  assert.equal(layoutProblems([...FILES, 'a.mts'], code.tsconfigs).length, 1)
  assert.equal(layoutProblems(FILES.filter((f) => f !== 'src/index.ts'), code.tsconfigs).length, 1, 'no src')
  const rooted = { 'tsconfig.build.json': { compilerOptions: { rootDir: '.' }, include: ['*.ts'] } }
  assert.equal(layoutProblems(FILES, rooted).length, 2)
})

test('P6: a test under src/ fails', () => {
  assert.match(layoutProblems([...FILES, 'src/a.test.ts'], code.tsconfigs)[0], /src\/a\.test\.ts is a test under src/)
  assert.equal(layoutProblems([...FILES, 'src/cli/b.spec.ts'], code.tsconfigs).length, 1)
})

test('P7: examples/ needs a *.test.ts', () => {
  const without = FILES.filter((f) => f !== 'examples/readme.test.ts')
  assert.match(layoutProblems(without, code.tsconfigs)[0], /examples\/ has no \*\.test\.ts/)
  assert.equal(layoutProblems([...without, 'examples/doors.ts'], code.tsconfigs).length, 1)
})

test('P8: docs/ holds only planning/, with a README', () => {
  assert.deepEqual(docsProblems(FILES), [])
  assert.deepEqual(docsProblems(['src/index.ts']), [])
  assert.match(docsProblems([...FILES, 'docs/decisions/D-01.md'])[0], /docs\/decisions is outside docs\/planning/)
  assert.match(docsProblems(['docs/planning/decisions/D-01.md'])[0], /docs\/planning\/README\.md is missing/)
})

test('P9: the CHANGELOG title is the package name', () => {
  assert.deepEqual(changelogProblems('@osdlc/app', '# @osdlc/app\n'), [])
  assert.deepEqual(changelogProblems('@osdlc/app', null), [])
  assert.match(changelogProblems('@osdlc/app', '# Changelog\n')[0], /start it "# @osdlc\/app"/)
})

test('P10: the README has Install and Licence sections', () => {
  assert.deepEqual(readmeProblems('@osdlc/app', README), [])
  assert.deepEqual(section('# T\n\n## A\nx\n\n## B\ny\n', 'A'), 'x\n')
  assert.equal(section('```\n## A\n```\n', 'A'), null, 'a fenced heading is not a section')
  assert.match(readmeProblems('@osdlc/app', '# x\n')[0], /no "## Install" section/)
  assert.equal(readmeProblems('@osdlc/app', '# x\n').length, 2)
  const license = README.replace('## Licence', '## License')
  assert.match(readmeProblems('@osdlc/app', license)[0], /no "## Licence" section/)
  const bare = README.replace(' See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).', '')
  assert.equal(readmeProblems('@osdlc/app', bare).length, 2)
  const other = README.replace('npm install @osdlc/app', 'npm install @osdlc/other')
  assert.match(readmeProblems('@osdlc/app', other)[0], /does not show `npm install @osdlc\/app`/)
})

test('P11: .gitignore lists node_modules/, dist/ and coverage/', () => {
  assert.deepEqual(gitignoreProblems('node_modules/\ndist/\ncoverage/\n.readme-*/\n'), [])
  assert.deepEqual(gitignoreProblems('node_modules/\ndist/\n'), ['.gitignore does not list coverage/'])
  assert.equal(gitignoreProblems(null).length, 1)
})

test('P13: a cataloged third-party dependency is written catalog:', () => {
  const catalog = { vitest: '^5.0.5', zod: '4.4.3' }
  assert.deepEqual(catalogProblems({ devDependencies: { vitest: 'catalog:' } }, catalog), [])
  assert.match(catalogProblems({ devDependencies: { vitest: '^5.0.5' } }, catalog)[0], /write "catalog:"/)
  assert.equal(catalogProblems({ dependencies: { zod: '4.4.3' } }, catalog).length, 1)
  // A peer range is a compatibility statement, not an install.
  assert.deepEqual(catalogProblems({ peerDependencies: { zod: '^4' } }, catalog), [])
  assert.deepEqual(catalogProblems({ dependencies: { other: '1.0.0' } }, catalog), [])
  assert.match(catalogProblems({ devDependencies: { other: 'catalog:' } }, catalog)[0], /has no other/)
  assert.deepEqual(parseCatalog("packages:\n  - 'a'\n\ncatalog:\n  '@x/y': ^1.0.0\n  # note\n  zod: 4.4.3\n\nother: 1\n"), {
    '@x/y': '^1.0.0',
    zod: '4.4.3',
  })
})

test('P13: the packed manifest has no catalog: or workspace: range', () => {
  assert.deepEqual(packedManifestProblems({ dependencies: { a: '^1.0.0' }, devDependencies: { b: '3.9.6' } }), [])
  assert.equal(packedManifestProblems({ dependencies: { a: 'workspace:^' } }).length, 1)
  assert.equal(packedManifestProblems({ devDependencies: { a: 'catalog:' } }).length, 1)
})

test('P14: a config package is ESM with exports, sideEffects false and the policy files', () => {
  const pkg = {
    type: 'module',
    exports: { '.': './index.json' },
    sideEffects: false,
    files: ['index.json', 'SECURITY.md', 'CONTRIBUTING.md'],
  }
  const files = ['index.json', 'SECURITY.md', 'CONTRIBUTING.md']
  assert.deepEqual(configPackageProblems(pkg, files), [])
  assert.equal(configPackageProblems({ ...pkg, type: undefined }, files).length, 1)
  assert.equal(configPackageProblems({ ...pkg, exports: undefined }, files).length, 1)
  assert.equal(configPackageProblems({ ...pkg, sideEffects: undefined }, files).length, 1)
  assert.match(configPackageProblems(pkg, ['index.json'])[0], /SECURITY\.md is missing/)
  assert.match(configPackageProblems({ ...pkg, files: ['index.json'] }, files)[0], /"files" does not list SECURITY\.md/)
})

test('a config package is exempt from the build, test, src and smoke rules', () => {
  const config = {
    ...code,
    dir: 'tsconfig',
    pkg: {
      name: '@osdlc/tsconfig',
      author: 'sksizer',
      type: 'module',
      exports: { './base': './presets/base.json' },
      sideEffects: false,
      files: ['SECURITY.md', 'CONTRIBUTING.md'],
      scripts: {},
    },
    files: ['presets/base.json', 'SECURITY.md', 'CONTRIBUTING.md', 'README.md'],
    tsconfigs: {},
    engines: {},
    readme: README.replaceAll('@osdlc/app', '@osdlc/tsconfig'),
    changelog: '# @osdlc/tsconfig\n',
  }
  assert.deepEqual(conventionProblems(config), [])
})

test('P15: a per-package .oxlintrc.json fails', () => {
  const problems = conventionProblems({ ...code, files: [...FILES, '.oxlintrc.json'] })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /\.oxlintrc\.json: delete it/)
})
