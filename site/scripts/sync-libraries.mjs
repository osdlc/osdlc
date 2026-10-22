// Builds a page for every library in packages/ts and packages/rust from its
// manifest and README, plus an overview that pairs twins: a TypeScript package
// and a Rust crate with the same name and the same behaviour. The pages are
// generated on each sync; the READMEs stay the one source.
//
// A library with a docs/guide/ folder gets it published under its page:
// markdown and MDX pages, which may import components from beside them.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packages = join(siteRoot, '..', 'packages')
const target = join(siteRoot, 'src', 'content', 'docs', 'libraries')
const base = '/osdlc'
const repo = 'https://github.com/osdlc/osdlc'

// A pair that shares a name but is not two implementations: the TypeScript
// package is the Rust crate compiled to WebAssembly.
const BUILT_FROM_RUST = new Set(['yaml-splice'])
const LANG = { ts: 'TypeScript', rust: 'Rust' }

const ts = await readTs()
const rust = await readRust()
const names = [...new Set([...ts.keys(), ...rust.keys()])].sort()

await rm(target, { recursive: true, force: true })
await mkdir(join(target, 'ts'), { recursive: true })
await mkdir(join(target, 'rust'), { recursive: true })

for (const lib of ts.values()) await writePage(lib, rust.get(lib.name))
for (const lib of rust.values()) await writePage(lib, ts.get(lib.name))
await writeFile(join(target, 'index.md'), overview())

console.log(`synced ${ts.size} TypeScript and ${rust.size} Rust libraries into ${target}`)

async function readTs() {
  const libs = new Map()
  for (const dir of await readdir(join(packages, 'ts'))) {
    const pkg = await readJson(join(packages, 'ts', dir, 'package.json'))
    if (!pkg || pkg.private) continue
    libs.set(dir, {
      lang: 'ts',
      name: dir,
      dir: `packages/ts/${dir}`,
      id: pkg.name,
      version: pkg.version,
      description: pkg.description,
      // Config presets (tsconfig, prettier-config) ship no code to document.
      hasApi: Object.values(pkg.exports ?? {}).some((e) => JSON.stringify(e).includes('/dist/')),
      readme: await readFile(join(packages, 'ts', dir, 'README.md'), 'utf8'),
      guide: await listGuide(join(packages, 'ts', dir)),
    })
  }
  return libs
}

async function readRust() {
  const workspace = await readFile(join(packages, 'rust', 'Cargo.toml'), 'utf8')
  const members = JSON.parse(/^members = (\[.*\])$/m.exec(workspace)[1])
  const libs = new Map()
  for (const dir of members) {
    const toml = await readFile(join(packages, 'rust', dir, 'Cargo.toml'), 'utf8')
    const field = (key) => new RegExp(`^${key} = "(.*)"$`, 'm').exec(toml)?.[1]
    if (/^publish = false$/m.test(toml)) continue
    const crate = field('name')
    libs.set(dir, {
      lang: 'rust',
      name: dir,
      dir: `packages/rust/${dir}`,
      id: crate,
      version: field('version'),
      description: field('description'),
      hasApi: true,
      readme: await readFile(join(packages, 'rust', dir, 'README.md'), 'utf8'),
      guide: await listGuide(join(packages, 'rust', dir)),
    })
  }
  return libs
}

function pageUrl(lib) {
  return `${base}/libraries/${lib.lang}/${lib.name}/`
}

function apiUrl(lib) {
  return lib.lang === 'ts'
    ? `${base}/api/ts/${lib.name}/`
    : `${base}/api/rust/${lib.id.replace(/-/g, '_')}/`
}

function relation(name) {
  if (!ts.has(name) || !rust.has(name)) return null
  return BUILT_FROM_RUST.has(name) ? 'wasm build' : 'twin'
}


async function writePage(lib, twin) {
  const rel = relation(lib.name)
  const facts = [
    ['Package', `\`${lib.id}\` ${lib.version}`],
    ['Install', lib.lang === 'ts' ? `\`pnpm add ${lib.id}\`` : `\`cargo add ${lib.id}\``],
    [
      'Registry',
      lib.lang === 'ts'
        ? `[npm](https://www.npmjs.com/package/${lib.id})`
        : `[crates.io](https://crates.io/crates/${lib.id}) · [docs.rs](https://docs.rs/${lib.id})`,
    ],
    ['API reference', lib.hasApi ? `[${lib.lang === 'ts' ? 'TypeDoc' : 'rustdoc'}](${apiUrl(lib)})` : 'none (config only)'],
    ['Source', `[${lib.dir}](${repo}/tree/main/${lib.dir})`],
  ]
  if (lib.guide.length) facts.splice(3, 0, ['Guide', `${lib.guide.length} pages, in the sidebar under ${lib.name}`])
  const aside = !rel
    ? ''
    : rel === 'twin'
      ? `:::tip[Twin]\nThis ${LANG[lib.lang]} library has a ${LANG[twin.lang]} twin, [${twin.id}](${pageUrl(twin)}). The two are written separately but aim for the same behaviour; see the README for how closely they match.\n:::\n\n`
      : lib.lang === 'ts'
        ? `:::note[Built from Rust]\nThis package is the Rust crate [${twin.id}](${pageUrl(twin)}) compiled to WebAssembly, so the two cannot drift apart.\n:::\n\n`
        : `:::note[Also on npm]\nThis crate is compiled to WebAssembly and published as [${twin.id}](${pageUrl(twin)}).\n:::\n\n`

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(lib.name)}`,
    `description: ${JSON.stringify(lib.description ?? '')}`,
    rel || lib.guide.length ? 'sidebar:' : null,
    // With a guide the page becomes the index of the library's sidebar group.
    lib.guide.length ? '  label: Overview\n  order: 0' : null,
    rel ? `  badge:\n    text: ${rel}\n    variant: ${rel === 'twin' ? 'tip' : 'note'}` : null,
    `editUrl: ${JSON.stringify(`${repo}/edit/main/${lib.dir}/README.md`)}`,
    '---',
    '',
    `<!-- Generated from ${lib.dir} by scripts/sync-libraries.mjs. Edit the README. -->`,
    '',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const table = ['| | |', '|---|---|', ...facts.map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
  const body = rewriteLinks(dropH1(lib.readme), lib.dir)
  const file = lib.guide.length ? join(lib.name, 'index.md') : `${lib.name}.md`
  await mkdir(dirname(join(target, lib.lang, file)), { recursive: true })
  await writeFile(join(target, lib.lang, file), `${frontmatter}${aside}${table}\n\n${body}`)
  for (const page of lib.guide) await copyGuidePage(lib, page)
}

async function listGuide(libRoot) {
  const guide = join(libRoot, 'docs', 'guide')
  const entries = await readdir(guide, { recursive: true }).catch(() => [])
  return entries.filter((f) => /\.mdx?$/.test(f)).sort()
}

// A guide page keeps its own frontmatter. Its relative imports are made
// absolute, links to sibling pages go to their site URLs, and any other
// relative link goes to GitHub.
async function copyGuidePage(lib, page) {
  const source = join(packages, '..', lib.dir, 'docs', 'guide', page)
  const pageDir = posix.dirname(page)
  let text = await readFile(source, 'utf8')
  text = text.replace(/^(import .+ from )'(\.{1,2}\/[^']+)'/gm, (m, head, rel) =>
    `${head}'${join(dirname(source), rel)}'`,
  )
  text = text.replace(/\]\((?!https?:|#|mailto:|\/)([^)\s]+)\)/g, (match, href) => {
    const [path, anchor] = href.split('#')
    const hash = anchor ? `#${anchor}` : ''
    const resolved = posix.normalize(posix.join(pageDir, path))
    if (/\.mdx?$/.test(path) && lib.guide.includes(resolved)) {
      return `](${pageUrl(lib)}${resolved.replace(/\.mdx?$/, '')}/${hash})`
    }
    return `](${new URL(posix.join('docs/guide', resolved), `${repo}/blob/main/${lib.dir}/`).href}${hash})`
  })
  const note = `Generated from ${lib.dir}/docs/guide/${page} by scripts/sync-libraries.mjs. Edit the source.`
  const comment = page.endsWith('.mdx') ? `{/* ${note} */}` : `<!-- ${note} -->`
  const editUrl = `editUrl: ${JSON.stringify(`${repo}/edit/main/${lib.dir}/docs/guide/${page}`)}`
  text = text.replace(/^---\n([\s\S]*?)\n---\n/, (m, fm) => `---\n${fm}\n${editUrl}\n---\n\n${comment}\n`)
  const out = join(target, lib.lang, lib.name, page)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, text)
}

function overview() {
  const cell = (lib) => (lib ? `[${lib.id}](${pageUrl(lib)}) ${lib.version}` : '—')
  const rows = names.map((name) => {
    const t = ts.get(name)
    const r = rust.get(name)
    const desc = (t ?? r).description ?? ''
    return `| ${name} | ${cell(t)} | ${cell(r)} | ${relation(name) ?? ''} | ${shorten(desc)} |`
  })
  const twins = names.filter((n) => relation(n) === 'twin')
  return [
    '---',
    'title: Libraries',
    'description: The TypeScript packages and Rust crates published from this repository.',
    'sidebar:',
    '  order: 0',
    '  label: Overview',
    '---',
    '',
    '<!-- Generated by scripts/sync-libraries.mjs. -->',
    '',
    `The repository publishes ${ts.size} TypeScript packages to npm under \`@osdlc\` and ${rust.size} Rust crates to crates.io.`,
    '',
    `A **twin** is a TypeScript package and a Rust crate with the same name and the same behaviour, written twice so each language gets a native library. There are ${twins.length}: ${twins.map((n) => `\`${n}\``).join(', ')}. A **wasm build** is a TypeScript package compiled from its Rust crate.`,
    '',
    'Each library page carries its README and links to its generated API reference.',
    '',
    '| Library | TypeScript | Rust | Pairing | What it does |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

function shorten(text) {
  const first = text.split(/(?<=[.:;])\s/)[0].replace(/[.:;]$/, '')
  return first.replace(/\|/g, '\\|')
}

function dropH1(text) {
  return text.replace(/^# .+\n+/m, '')
}

// Relative links in a README point into the repository; send them to GitHub.
function rewriteLinks(body, dir) {
  return body.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (match, href) => {
    const [path, anchor] = href.split('#')
    const hash = anchor ? `#${anchor}` : ''
    return `](${new URL(path, `${repo}/blob/main/${dir}/`).href}${hash})`
  })
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}
