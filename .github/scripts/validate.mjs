// Static checks on the published plugin packs, using only Node builtins so it
// runs on a bare checkout. Generated: written by sksizer/dev's
// scripts/sdlc-mirror/assemble.ts on each release (edit
// scripts/sdlc-mirror/templates/product/github/scripts/validate.mjs there).
//
// Checks, per harness (Claude Code, Codex, Cursor, Pi):
//   - every plugin in the marketplace manifest has a pack directory;
//   - the pack's manifest parses, names its plugin, carries a version, and
//     does not read "UNLICENSED";
//   - the pack holds at least one skill, and every skill directory has a
//     SKILL.md.
// Then repo-wide:
//   - every .mjs script parses (`node --check`);
//   - the bundled sdlc CLI starts under plain Node and reports the version
//     the marketplace names for sdlc;
//   - LICENSE exists and CHANGELOG.md has a section for that version.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const problems = []
const fail = (msg) => problems.push(msg)
const readJson = (rel) => {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'))
  } catch (err) {
    fail(`${rel}: ${err.message}`)
    return undefined
  }
}

// Where each harness keeps its marketplace manifest, packs and pack manifest.
// Pi has no marketplace; its pack manifest is a package.json, which for sdlc is
// the injected runtime-deps file, so Pi is checked for its `pi` key instead of
// a plugin name and version.
const harnesses = [
  {
    name: 'claude',
    market: '.claude-plugin/marketplace.json',
    packs: '.claude-plugin/packs',
    manifest: '.claude-plugin/plugin.json',
  },
  {
    name: 'codex',
    market: '.agents/plugins/marketplace.json',
    packs: '.agents/packs',
    manifest: '.codex-plugin/plugin.json',
  },
  {
    name: 'cursor',
    market: '.cursor-plugin/marketplace.json',
    packs: '.cursor-plugin/packs',
    manifest: '.cursor-plugin/plugin.json',
  },
  { name: 'pi', market: null, packs: '.pi/packs', manifest: 'package.json', plain: true },
]

let plugins // names listed by the Claude marketplace: the reference set
let sdlcVersion
for (const h of harnesses) {
  if (h.market !== null) {
    const market = readJson(h.market)
    const names = (market?.plugins ?? []).map((p) => p.name)
    plugins ??= names
    if (JSON.stringify(names) !== JSON.stringify(plugins)) {
      fail(`${h.market}: plugins [${names}] differ from [${plugins}]`)
    }
    if (h.name === 'claude') {
      sdlcVersion = (market?.plugins ?? []).find((p) => p.name === 'sdlc')?.version
    }
  }
}
if (!plugins || plugins.length === 0) fail('no plugins listed in the Claude marketplace')

for (const h of harnesses) {
  const packsDir = join(root, h.packs)
  const present = existsSync(packsDir) ? readdirSync(packsDir) : []
  for (const extra of present.filter((n) => !(plugins ?? []).includes(n))) {
    fail(`${h.packs}/${extra} is not a listed plugin`)
  }
  for (const plugin of plugins ?? []) {
    const pack = `${h.packs}/${plugin}`
    if (!present.includes(plugin)) {
      fail(`${pack} is missing`)
      continue
    }
    const manifest = readJson(`${pack}/${h.manifest}`)
    if (manifest) {
      if (h.plain) {
        if (manifest.pi === undefined) fail(`${pack}/${h.manifest}: no "pi" key`)
      } else {
        if (manifest.name !== plugin)
          fail(
            `${pack}/${h.manifest}: name is ${JSON.stringify(manifest.name)}, expected ${plugin}`,
          )
        if (typeof manifest.version !== 'string') fail(`${pack}/${h.manifest}: no version`)
      }
      if (manifest.license === 'UNLICENSED') fail(`${pack}/${h.manifest}: license is UNLICENSED`)
    }
    const skillsDir = join(root, pack, 'skills')
    const skills = existsSync(skillsDir)
      ? readdirSync(skillsDir).filter((n) => statSync(join(skillsDir, n)).isDirectory())
      : []
    if (skills.length === 0) fail(`${pack}: no skills`)
    for (const s of skills) {
      if (!existsSync(join(skillsDir, s, 'SKILL.md'))) fail(`${pack}/skills/${s}: no SKILL.md`)
    }
  }
}

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.mjs')) out.push(p)
  }
  return out
}
for (const script of walk(root)) {
  const r = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' })
  if (r.status !== 0)
    fail(`${script.slice(root.length + 1)} does not parse: ${r.stderr.trim().split('\n')[0]}`)
}

if (sdlcVersion === undefined) {
  fail('the Claude marketplace lists no sdlc version')
} else {
  const r = spawnSync(
    process.execPath,
    [join(root, '.claude-plugin/packs/sdlc/cli/sdlc.js'), '--version'],
    { encoding: 'utf8' },
  )
  const reported = r.stdout.trim()
  if (r.status !== 0 || reported !== sdlcVersion) {
    fail(
      `sdlc --version reported ${JSON.stringify(reported)} (exit ${r.status}), expected ${sdlcVersion}`,
    )
  }
  const changelog = existsSync(join(root, 'CHANGELOG.md'))
    ? readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
    : ''
  if (!changelog.includes(`## [${sdlcVersion}]`))
    fail(`CHANGELOG.md has no section for ${sdlcVersion}`)
}
if (!existsSync(join(root, 'LICENSE'))) fail('LICENSE is missing')

if (problems.length > 0) {
  console.error(`validate: ${problems.length} problem(s)`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log(`validate: ok — ${(plugins ?? []).join(', ')} across ${harnesses.length} harnesses`)
