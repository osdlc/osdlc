// Builds a page for every library in packages/ts and packages/rust from its
// manifest and README, plus an overview that pairs twins: a TypeScript package
// and a Rust crate with the same name and the same behaviour. The pages are
// generated on each sync; the READMEs stay the one source.
//
// A library with a docs/guide/ folder gets it published under its page:
// markdown and MDX pages, which may import components from beside them.
//
// An app (APPS) gets its own top-level section instead: a landing page built
// from its README, its guide pages, and a library page that links there.
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const packages = join(siteRoot, '..', 'packages')
const docs = join(siteRoot, 'src', 'content', 'docs')
const target = join(docs, 'libraries')
const base = '/osdlc'
const repo = 'https://github.com/osdlc/osdlc'

// A pair that shares a name but is not two implementations: the TypeScript
// package is the Rust crate compiled to WebAssembly.
const BUILT_FROM_RUST = new Set(['yaml-splice'])
const LANG = { ts: 'TypeScript', rust: 'Rust' }

// TypeScript packages that are apps. `runners` names the package whose README
// holds the runner table the landing page shows.
const APPS = { wayfinder: { runners: 'system-model' } }

const ts = await readTs()
const rust = await readRust()
const names = [...new Set([...ts.keys(), ...rust.keys()])].sort()

await rm(target, { recursive: true, force: true })
await mkdir(join(target, 'ts'), { recursive: true })
await mkdir(join(target, 'rust'), { recursive: true })

for (const lib of ts.values()) await writePage(lib, rust.get(lib.name))
for (const lib of rust.values()) await writePage(lib, ts.get(lib.name))
await writeFile(join(target, 'index.md'), overview())
for (const name of Object.keys(APPS)) await writeApp(ts.get(name))

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
  const app = isApp(lib)
  if (app) facts.splice(3, 0, ['Guide', `[${lib.name}](${appUrl(lib)}), with ${lib.guide.length} guide pages`])
  else if (lib.guide.length) facts.splice(3, 0, ['Guide', `${lib.guide.length} pages, in the sidebar under ${lib.name}`])
  const guide = app ? [] : lib.guide
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
    rel || guide.length ? 'sidebar:' : null,
    // With a guide the page becomes the index of the library's sidebar group.
    guide.length ? '  label: Overview\n  order: 0' : null,
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
  const file = guide.length ? join(lib.name, 'index.md') : `${lib.name}.md`
  await mkdir(dirname(join(target, lib.lang, file)), { recursive: true })
  await writeFile(join(target, lib.lang, file), `${frontmatter}${aside}${table}\n\n${body}`)
  for (const page of guide) await copyGuidePage(lib, page, join(target, lib.lang, lib.name), pageUrl(lib))
}

async function listGuide(libRoot) {
  const guide = join(libRoot, 'docs', 'guide')
  const entries = await readdir(guide, { recursive: true }).catch(() => [])
  return entries.filter((f) => /\.mdx?$/.test(f)).sort()
}

// A guide page keeps its own frontmatter. Its relative imports are made
// absolute, links to sibling pages go to their site URLs (under `url`), and
// any other relative link goes to GitHub.
async function copyGuidePage(lib, page, outDir, url) {
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
      return `](${url}${resolved.replace(/\.mdx?$/, '')}/${hash})`
    }
    return `](${new URL(posix.join('docs/guide', resolved), `${repo}/blob/main/${lib.dir}/`).href}${hash})`
  })
  const note = `Generated from ${lib.dir}/docs/guide/${page} by scripts/sync-libraries.mjs. Edit the source.`
  const comment = page.endsWith('.mdx') ? `{/* ${note} */}` : `<!-- ${note} -->`
  const editUrl = `editUrl: ${JSON.stringify(`${repo}/edit/main/${lib.dir}/docs/guide/${page}`)}`
  text = text.replace(/^---\n([\s\S]*?)\n---\n/, (m, fm) => `---\n${fm}\n${editUrl}\n---\n\n${comment}\n`)
  const out = join(outDir, page)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, text)
}

function isApp(lib) {
  return lib.lang === 'ts' && Object.hasOwn(APPS, lib.name)
}

function appUrl(lib) {
  return `${base}/${lib.name}/`
}

// The app's section: its guide pages, its screenshots, and a landing page made
// from parts of its README. Every part is copied, so the page matches the
// package's own docs.
async function writeApp(lib) {
  const out = join(docs, lib.name)
  const images = join(siteRoot, 'public', lib.name)
  await rm(out, { recursive: true, force: true })
  await rm(images, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  for (const page of lib.guide) await copyGuidePage(lib, page, out, appUrl(lib))

  const shots = ['list-light.png', 'list-dark.png']
  const imageDir = join(packages, '..', lib.dir, 'docs', 'guide', 'images')
  await mkdir(images, { recursive: true })
  for (const shot of shots) await copyFile(join(imageDir, shot), join(images, shot))

  const readme = sections(lib.readme)
  const need = (heading) => {
    const text = readme.get(heading)
    if (text === undefined) throw new Error(`${lib.dir}/README.md has no "${heading}" section`)
    return appLinks(text, lib)
  }
  const intro = need('')
  const fence = /```[\s\S]*?```\n/.exec(intro)
  const prose = intro.replace(fence?.[0] ?? '', '').replace(/\n{3,}/g, '\n\n').trim()
  const guidePage = (page, label) => {
    if (!lib.guide.includes(page)) throw new Error(`${lib.dir}/docs/guide has no ${page}`)
    return `[${label}](${appUrl(lib)}${page.replace(/\.mdx?$/, '')}/)`
  }
  const runners = await readFile(join(packages, 'ts', APPS[lib.name].runners, 'README.md'), 'utf8')
  const table = /^\| Runner \| .*\n(?:\|.*\n)+/m.exec(runners)
  if (table === null) throw new Error(`no runner table in ${APPS[lib.name].runners}'s README`)

  const page = [
    '---',
    `title: ${JSON.stringify(lib.name)}`,
    `description: ${JSON.stringify(lib.description ?? '')}`,
    'sidebar:',
    '  label: Overview',
    '  order: 0',
    `editUrl: ${JSON.stringify(`${repo}/edit/main/${lib.dir}/README.md`)}`,
    '---',
    '',
    `<!-- Generated from ${lib.dir} by scripts/sync-libraries.mjs. Edit its README and docs/guide/. -->`,
    '',
    prose,
    '',
    `<img class="dark:sl-hidden" src="${base}/${lib.name}/list-light.png" alt="The ${lib.name} web view: the task list grouped by runner" />`,
    `<img class="light:sl-hidden" src="${base}/${lib.name}/list-dark.png" alt="The ${lib.name} web view in dark mode" />`,
    '',
    '## Install',
    '',
    need('Install'),
    '',
    '## Quick start',
    '',
    fence?.[0].trim() ?? '',
    '',
    `${guidePage('getting-started.md', 'Getting started')} walks through each command.`,
    '',
    '## Three surfaces',
    '',
    `- **The terminal UI.** ${await guideLead(lib, 'terminal-ui.md')} See ${guidePage('terminal-ui.md', 'The terminal UI')}.`,
    `- **The web view.** ${firstParagraph(need('The web view'))} See ${guidePage('web-view.mdx', 'The web view')}.`,
    `- **The shell.** ${firstParagraph(need('Searching from the shell'))}`,
    '',
    '## Trust',
    '',
    firstParagraph(need('Execution, and trust')),
    '',
    `See ${guidePage('trust.md', 'Trust and execution')}.`,
    '',
    '## Configuration',
    '',
    firstParagraph(need('Configuration')),
    '',
    `See ${guidePage('configuration.md', 'Configuration')}.`,
    '',
    '## JSON for scripts and agents',
    '',
    need('Documents'),
    '',
    `See ${guidePage('task-model.md', 'The task model and JSON')}.`,
    '',
    '## Runners',
    '',
    table[0].trim(),
    '',
    '`way providers` lists every tool, built in or your own, and whether its binary is on `PATH`.',
    '',
  ].join('\n')
  await writeFile(join(out, 'index.md'), page)
}

// A README split by heading: '' is the text before the first `## `; each `##`
// and `###` heading maps to the text up to the next heading of its level or
// higher.
function sections(text) {
  const body = dropH1(text)
  const out = new Map()
  const lines = body.split('\n')
  let fenced = false
  const heads = []
  lines.forEach((line, i) => {
    if (line.startsWith('```')) fenced = !fenced
    const m = !fenced && /^(##+) (.+)$/.exec(line)
    if (m) heads.push({ i, level: m[1].length, title: m[2] })
  })
  out.set('', lines.slice(0, heads[0]?.i ?? lines.length).join('\n').trim())
  heads.forEach((h, n) => {
    const end = heads.slice(n + 1).find((o) => o.level <= h.level)?.i ?? lines.length
    out.set(h.title, lines.slice(h.i + 1, end).join('\n').trim())
  })
  return out
}

// The first paragraph of a guide page, after its frontmatter and imports.
async function guideLead(lib, page) {
  const text = await readFile(join(packages, '..', lib.dir, 'docs', 'guide', page), 'utf8')
  return firstParagraph(text.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^import .*$/gm, ''))
}

// The first paragraph of prose: no code block, table or heading.
function firstParagraph(text) {
  const prose = text
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p !== '' && !/^[|#<]/.test(p))
  return (prose ?? '').replace(/\n/g, ' ')
}

// README links on the app page: guide files go to the app's guide pages, the
// README's own anchors to its library page, and the rest to GitHub.
function appLinks(text, lib) {
  return text.replace(/\]\((?!https?:|mailto:)([^)\s]+)\)/g, (match, href) => {
    const [path, anchor] = href.split('#')
    const hash = anchor ? `#${anchor}` : ''
    if (path === '') return `](${pageUrl(lib)}${hash})`
    const page = path.replace(/^(\.\/)?docs\/guide\//, '')
    if (page !== path && lib.guide.includes(page)) {
      return `](${appUrl(lib)}${page.replace(/\.mdx?$/, '')}/${hash})`
    }
    return `](${new URL(path, `${repo}/blob/main/${lib.dir}/`).href}${hash})`
  })
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
