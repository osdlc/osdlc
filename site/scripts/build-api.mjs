// Generates the API reference for every library into public/api, so the site
// serves it under /osdlc/api/: rustdoc for the Rust crates at api/rust/<crate>/
// and TypeDoc for the TypeScript packages at api/ts/<name>/. Needs cargo on the
// PATH. Slow, so it is its own step rather than part of every sync.
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packages = join(siteRoot, '..', 'packages')
const out = join(siteRoot, 'public', 'api')
const only = process.argv[2] // 'rust' or 'ts' to build one side

// For TypeDoc, in place of the packages' tsconfigs: those extend
// @osdlc/tsconfig, which is only installed with the packages workspace.
const COMPILER_OPTIONS = {
  target: 'ES2023',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  strict: true,
  skipLibCheck: true,
  noEmit: true,
}

await rm(only ? join(out, only) : out, { recursive: true, force: true })
if (only !== 'ts') rustdoc()
if (only !== 'rust') await typedoc()

function rustdoc() {
  const rust = join(packages, 'rust')
  // The wasm wrapper is not published; its page would be noise.
  execFileSync('cargo', ['doc', '--no-deps', '--workspace', '--exclude', 'yaml-splice-wasm'], {
    cwd: rust,
    stdio: 'inherit',
  })
  return cp(join(rust, 'target', 'doc'), join(out, 'rust'), { recursive: true })
}

async function typedoc() {
  const bin = join(siteRoot, 'node_modules', '.bin', 'typedoc')
  const scratch = await mkdtemp(join(tmpdir(), 'osdlc-typedoc-'))
  const tsconfig = join(scratch, 'tsconfig.json')
  for (const dir of await readdir(join(packages, 'ts'))) {
    const root = join(packages, 'ts', dir)
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    if (pkg.private) continue
    const entries = await entryPoints(root, pkg.exports ?? {})
    if (entries.length === 0) continue // a config preset with no code
    console.log(`typedoc ${pkg.name}`)
    await writeFile(tsconfig, JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: entries }))
    execFileSync(
      bin,
      [
        ...entries.flatMap((e) => ['--entryPoints', e]),
        '--tsconfig', tsconfig,
        '--out', join(out, 'ts', dir),
        '--name', `${pkg.name} ${pkg.version}`,
        '--readme', 'none',
        // The packages' own dependencies are not installed either; document
        // what the source declares and let unresolved imports be `any`.
        '--skipErrorChecking',
        '--logLevel', 'Error',
      ],
      { stdio: 'inherit' },
    )
  }
  await rm(scratch, { recursive: true, force: true })
}

// Each export maps ./dist/x.js back to its source, src/x.ts.
async function entryPoints(root, exports) {
  const found = []
  for (const value of Object.values(exports)) {
    const js = typeof value === 'string' ? value : (value.default ?? value.import)
    const m = /^\.\/dist\/(.+)\.js$/.exec(js ?? '')
    if (!m) continue
    const src = join(root, 'src', `${m[1]}.ts`)
    if (await exists(src)) found.push(src)
  }
  return found
}

async function exists(file) {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}
