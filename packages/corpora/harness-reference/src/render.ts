/**
 * Render the harness reference bundle into static pages, as a map from
 * output path to file content. Pure: nothing here touches the disk.
 */
import type { Dataset } from './load.ts'
import type { Fact, Harness, Observation, Source, Subject } from './schema.ts'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text with `code` spans kept. */
const text = (s: string): string =>
  esc(s).replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)

function renderScalar(v: unknown): string {
  if (v === true) return '<span class="yes">yes</span>'
  if (v === false) return '<span class="no">no</span>'
  if (v === 'partial') return '<span class="partial">partial</span>'
  if (Array.isArray(v)) return v.map((x) => `<code>${esc(String(x))}</code>`).join(' ')
  if (v !== null && typeof v === 'object') return `<code>${esc(JSON.stringify(v))}</code>`
  return text(String(v))
}

function renderValue(value: Record<string, unknown>): string {
  const parts: string[] = []
  if ('supported' in value) parts.push(renderScalar(value['supported']))
  for (const [k, v] of Object.entries(value)) {
    if (k === 'supported') continue
    parts.push(`<span class="k">${esc(k.replaceAll('_', ' '))}</span> ${renderScalar(v)}`)
  }
  return parts.join('<br>')
}

const sameValue = (a: Observation, b: Observation): boolean =>
  JSON.stringify(a.value) === JSON.stringify(b.value)

/** The observation that holds now: the latest one whose `until` is open. */
export function current(f: Fact): Observation | undefined {
  return f.observations.filter((o) => o.until === null).at(-1)
}

function versionRange(o: Observation): string {
  if (o.since === null && o.until === null) return ''
  if (o.until === null) return `from ${o.since}`
  if (o.since === null) return `until ${o.until}`
  return `${o.since} to ${o.until}`
}

function sourceLink(f: Fact, sid: string): string {
  const s = f.sources.find((x: Source) => x.id === sid)
  return s ? `<a href="${esc(s.resource)}" title="${esc(s.title)}">${esc(s.id)}</a>` : esc(sid)
}

function observationMeta(f: Fact, o: Observation): string {
  const bits = [`observed ${o.observed}`]
  const range = versionRange(o)
  if (range) bits.push(range)
  if (o.checked_version) bits.push(`checked on ${esc(o.checked_version)}`)
  if (o.evidence) bits.push(esc(o.evidence))
  let src = sourceLink(f, o.source)
  if (o.via) src += ` via ${sourceLink(f, o.via)}`
  if (o.locator) src += ` <span class="loc">${text(o.locator)}</span>`
  bits.push(src)
  return bits.join(' · ')
}

function page(title: string, depth: number, body: string): string {
  const up = '../'.repeat(depth)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Harness reference</title>
<style>
:root { --fg:#1b1d21; --muted:#5f6670; --line:#d9dde3; --bg:#fff; --head:#f4f6f8; --yes:#17663a; --no:#a3271f; --partial:#8a5a00; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --fg:#e6e8eb; --muted:#9aa3ad; --line:#353b43; --bg:#14171b; --head:#1d2126; --yes:#5fcf8c; --no:#f08a80; --partial:#e2b55a; } }
body { font: 14px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 0 16px 48px; }
header { padding: 16px 0; border-bottom: 1px solid var(--line); margin-bottom: 16px; }
header nav a { margin-right: 16px; }
a { color: inherit; }
h1 { font-size: 22px; margin: 8px 0; } h2 { font-size: 18px; margin-top: 32px; } h3 { font-size: 15px; }
.muted, .loc { color: var(--muted); } .k { color: var(--muted); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; text-align: left; }
thead th { background: var(--head); position: sticky; top: 0; }
th.row { background: var(--head); min-width: 160px; }
td { min-width: 140px; max-width: 280px; font-size: 13px; }
td.gap { color: var(--muted); text-align: center; }
.when { display: block; color: var(--muted); font-size: 11px; margin-top: 4px; }
.yes { color: var(--yes); font-weight: 600; } .no { color: var(--no); font-weight: 600; } .partial { color: var(--partial); font-weight: 600; }
code { font-size: 12px; overflow-wrap: anywhere; }
ul.obs { padding-left: 20px; } ul.obs li { margin-bottom: 8px; }
.tag { display: inline-block; font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid var(--line); margin-right: 6px; }
</style>
</head>
<body>
<header>
<nav><a href="${up}index.html">Comparison</a><a href="${up}changes.html">Changes</a><a href="${up}gaps.html">Gaps</a></nav>
<h1>${esc(title)}</h1>
</header>
${body}
</body>
</html>
`
}

function observationList(f: Fact): string {
  return `<ul class="obs">${f.observations
    .map(
      (o) =>
        `<li>${renderValue(o.value)}${o.note ? `<br><span class="muted">${text(o.note)}</span>` : ''}<br><span class="when">${observationMeta(f, o)}</span></li>`,
    )
    .join('')}</ul>${
    f.open?.length
      ? `<p class="muted">Open: ${f.open.map((q) => text(q.question)).join(' ')}</p>`
      : ''
  }`
}

export interface Change {
  date: string
  fact: Fact
  obs: Observation
  kind: 'first observed' | 'changed' | 're-observed'
}

export function changes(facts: Fact[]): Change[] {
  const out: Change[] = []
  for (const f of facts)
    f.observations.forEach((o, i) => {
      const prev = f.observations[i - 1]
      const kind = !prev ? 'first observed' : sameValue(prev, o) ? 're-observed' : 'changed'
      out.push({ date: o.observed, fact: f, obs: o, kind })
    })
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

function changeLog(list: Change[], label: (c: Change, up: string) => string, up: string): string {
  const byDate = new Map<string, Change[]>()
  for (const c of list) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c])
  return [...byDate.entries()]
    .map(
      ([date, cs]) =>
        `<h3>${date}</h3><ul class="obs">${cs
          .map(
            (c) =>
              `<li><span class="tag">${c.kind}</span>${label(c, up)}: ${renderValue(c.obs.value)}<span class="when">${observationMeta(c.fact, c.obs)}</span></li>`,
          )
          .join('')}</ul>`,
    )
    .join('\n')
}

/**
 * Every page of the site: a comparison per category (index.html), a history
 * per harness and per subject, a dated change list, the gaps, and data.json.
 */
export function renderSite(ds: Dataset): Map<string, string> {
  const files = new Map<string, string>()
  const write = (rel: string, content: string): void => {
    files.set(rel, content)
  }
  const factBy = new Map(ds.facts.map((f) => [`${f.harness} ${f.subject}`, f]))
  const harnessById = new Map(ds.harnesses.map((h) => [h.id, h]))
  const subjectById = new Map(ds.subjects.map((s) => [s.id, s]))
  const standards = ds.harnesses.filter((h) => h.type === 'Standard')
  const tools = ds.harnesses.filter((h) => h.type === 'Harness')
  const columns = [...standards, ...tools]
  /** A cell is covered only when its fact has an observation still in force. */
  const covers = (h: Harness, s: Subject): boolean => {
    const f = factBy.get(`${h.id} ${s.id}`)
    return f !== undefined && current(f) !== undefined
  }
  const subjectHref = (s: Subject, up: string): string => `${up}subjects/${s.id}.html`
  const harnessHref = (h: Harness, up: string): string => `${up}harnesses/${h.id}.html`

  // index.html: one comparison table per category
  {
    const sections = ds.categories.map((c) => {
      const subjects = ds.subjects.filter((s) => s.category === c.id)
      const head = columns
        .map((h) => `<th><a href="${harnessHref(h, '')}">${esc(h.title)}</a></th>`)
        .join('')
      const rows = subjects.map((s) => {
        const cells = columns.map((h) => {
          const f = factBy.get(`${h.id} ${s.id}`)
          const o = f && current(f)
          if (!f || !o) return `<td class="gap">${f?.open?.length ? 'open question' : '—'}</td>`
          const more = f.observations.length > 1 ? ` · ${f.observations.length} observations` : ''
          return `<td>${renderValue(o.value)}<span class="when">${o.observed}${versionRange(o) ? ` · ${versionRange(o)}` : ''}${more}</span></td>`
        })
        return `<tr><th class="row"><a href="${subjectHref(s, '')}">${esc(s.title)}</a></th>${cells.join('')}</tr>`
      })
      return `<h2 id="${c.id}">${esc(c.title)}</h2><p class="muted">${esc(c.description)}</p>
  <div class="scroll"><table><thead><tr><th>Subject</th>${head}</tr></thead><tbody>${rows.join('\n')}</tbody></table></div>`
    })
    const toc = ds.categories.map((c) => `<a href="#${c.id}">${esc(c.title)}</a>`).join(' · ')
    const obsCount = ds.facts.reduce((n, f) => n + f.observations.length, 0)
    write(
      'index.html',
      page(
        'Harness comparison',
        0,
        `<p>What each coding-agent harness does today, one row per subject. Each cell is the latest observation still in force, with the date it was checked. A dash means no observation is in force for it. ${tools.length} harnesses, ${standards.length} standards, ${ds.subjects.length} subjects, ${obsCount} observations.</p><p>${toc}</p>${sections.join('\n')}`,
      ),
    )
  }

  // harnesses/<id>.html: current facts, then the dated history
  for (const h of ds.harnesses) {
    const facts = ds.facts.filter((f) => f.harness === h.id)
    const byCategory = ds.categories
      .map((c) => {
        const fs = ds.subjects
          .filter((s) => s.category === c.id)
          .flatMap((s) => factBy.get(`${h.id} ${s.id}`) ?? [])
        if (fs.length === 0) return ''
        return `<h3>${esc(c.title)}</h3>${fs
          .map((f) => {
            const s = subjectById.get(f.subject)!
            return `<h4><a href="${subjectHref(s, '../')}">${esc(s.title)}</a></h4>${observationList(f)}`
          })
          .join('')}`
      })
      .join('')
    const log = changeLog(
      changes(facts),
      (c, up) => {
        const s = subjectById.get(c.fact.subject)!
        return `<a href="${subjectHref(s, up)}">${esc(s.title)}</a>`
      },
      '../',
    )
    const intro = `<p>${esc(h.description)}</p><p class="muted">${esc(h.type)} · ${esc(h.vendor)} · versions: ${h.versioning}${h.resource ? ` · <a href="${esc(h.resource)}">${esc(h.resource)}</a>` : ''}</p>`
    write(
      `harnesses/${h.id}.html`,
      page(h.title, 1, `${intro}<h2>History</h2>${log}<h2>All facts</h2>${byCategory}`),
    )
  }

  // subjects/<category>/<name>.html: every harness's observations for one subject
  for (const s of ds.subjects) {
    const rows = columns
      .map((h) => {
        const f = factBy.get(`${h.id} ${s.id}`)
        if (!f) return ''
        return `<h3><a href="${harnessHref(h, '../../')}">${esc(h.title)}</a></h3>${observationList(f)}`
      })
      .join('')
    const missing = tools.filter((h) => !covers(h, s)).map((h) => h.title)
    write(
      `subjects/${s.id}.html`,
      page(
        s.title,
        2,
        `<p>${esc(s.description)}</p>${rows}${missing.length ? `<p class="muted">No observation in force: ${esc(missing.join(', '))}.</p>` : ''}`,
      ),
    )
  }

  // changes.html: every observation by date, newest first
  write(
    'changes.html',
    page(
      'Changes by date',
      0,
      `<p>Every observation, newest first. <em>changed</em> means the value differs from the previous observation of the same fact.</p>${changeLog(
        changes(ds.facts),
        (c, up) => {
          const h = harnessById.get(c.fact.harness)!
          const s = subjectById.get(c.fact.subject)!
          return `<a href="${harnessHref(h, up)}">${esc(h.title)}</a> · <a href="${subjectHref(s, up)}">${esc(s.title)}</a>`
        },
        '',
      )}`,
    ),
  )

  // gaps.html: open questions, then uncovered cells per category
  {
    const open = ds.facts
      .flatMap((f) => (f.open ?? []).map((q) => ({ f, q })))
      .map(({ f, q }) => {
        const h = harnessById.get(f.harness)!
        const s = subjectById.get(f.subject)!
        return `<li><a href="${harnessHref(h, '')}">${esc(h.title)}</a> · <a href="${subjectHref(s, '')}">${esc(s.title)}</a>: ${text(q.question)}<span class="when">${q.observed} · ${sourceLink(f, q.source)}</span></li>`
      })
    const uncovered = ds.categories.map((c) => {
      const items = ds.subjects
        .filter((s) => s.category === c.id)
        .map((s) => {
          const missing = tools.filter((h) => !covers(h, s))
          return missing.length
            ? `<li><a href="${subjectHref(s, '')}">${esc(s.title)}</a>: ${esc(missing.map((h) => h.title).join(', '))}</li>`
            : ''
        })
        .join('')
      return items ? `<h3>${esc(c.title)}</h3><ul>${items}</ul>` : ''
    })
    const cells = ds.subjects.length * tools.length
    const covered = ds.subjects.reduce((n, s) => n + tools.filter((h) => covers(h, s)).length, 0)
    write(
      'gaps.html',
      page(
        'Gaps',
        0,
        `<p>${covered} of ${cells} harness × subject cells have an observation in force. Open questions come from the sources; uncovered cells have no observation in force, either because no source said anything or because every observation has ended.</p><h2>Open questions</h2><ul class="obs">${open.join('')}</ul><h2>Uncovered cells</h2>${uncovered.join('')}`,
      ),
    )
  }

  write('data.json', `${JSON.stringify(ds, null, 2)}\n`)
  return files
}
