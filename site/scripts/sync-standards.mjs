// Copies the repository's standards/*.md into the site's docs collection.
// standards/ stays the one source: plain markdown that reads on GitHub. This
// adds the frontmatter Starlight needs (title from the H1, sidebar order) and
// rewrites links so they resolve on the site.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(siteRoot, '..', 'standards')
const target = join(siteRoot, 'src', 'content', 'docs', 'standards')
const repoBlob = 'https://github.com/osdlc/osdlc/blob/main/'

// Sidebar order; a file not listed sorts after these, by name.
const ORDER = ['README.md', 'verbs.md', 'sdlc-yaml.md', 'doc-locations.md', 'review.md']

const slugOf = (file) => (file === 'README.md' ? 'index' : file.replace(/\.md$/, ''))

function rewriteLinks(body, isIndex) {
  return body.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (match, href) => {
    const [path, anchor] = href.split('#')
    const hash = anchor ? `#${anchor}` : ''
    const sibling = /^\.\/([\w-]+)\.md$/.exec(path)
    if (sibling) {
      const slug = sibling[1] === 'README' ? '' : `${sibling[1]}/`
      return `](${isIndex ? './' : '../'}${slug}${hash})`
    }
    // Anything else in the repository links to its GitHub page.
    return `](${new URL(path, `${repoBlob}standards/`).href}${hash})`
  })
}

const files = (await readdir(source)).filter((f) => f.endsWith('.md'))
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

for (const file of files) {
  const text = await readFile(join(source, file), 'utf8')
  const h1 = /^# (.+)$/m.exec(text)
  if (!h1) throw new Error(`standards/${file} has no H1 to use as its title`)
  const title = h1[1].replace(/`/g, '')
  const body = rewriteLinks(text.replace(h1[0], '').trimStart(), file === 'README.md')
  const rank = ORDER.indexOf(file)
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `sidebar:`,
    `  order: ${rank === -1 ? ORDER.length : rank}`,
    file === 'README.md' ? '  label: Overview' : null,
    `editUrl: ${JSON.stringify(`https://github.com/osdlc/osdlc/edit/main/standards/${file}`)}`,
    '---',
    '',
    `{/* Generated from standards/${file} by scripts/sync-standards.mjs. Edit the source. */}`,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
  await writeFile(join(target, `${slugOf(file)}.mdx`), frontmatter + escapeMdx(body))
}

console.log(`synced ${files.length} standards into ${target}`)

// The copies are MDX so the generated-file note can be a comment; escape the
// characters MDX would read as JSX outside code.
function escapeMdx(body) {
  return body
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : part.replace(/[{}<]/g, (c) => `\\${c}`)))
    .join('')
}
