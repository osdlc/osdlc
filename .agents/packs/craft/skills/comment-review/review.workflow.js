export const meta = {
  name: 'comment-review',
  description:
    'Judge every comment in an inventory against the expression ladder, collapse cross-file duplication, and defend each deletion',
  phases: [
    { title: 'Judge', detail: 'one agent per file returns a verdict per comment' },
    {
      title: 'Dedupe',
      detail: 'one agent over every verdict groups duplicated facts and resolves promote-to-doc',
    },
    { title: 'Defend', detail: 'one agent per delete or dedupe-to-reference argues to keep it' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. `args` is the object /comment-review passes from Step 2:
//   {
//     rulesPath: "<abs path to references/comment-rubric.md beside the skill>",
//     files: [{ path, comments: [{ line, text, declaration }] }],
//     docsRoots: ["<the project's docs directories>", ...],
//     scope: "one line naming what is under review",
//   }
// ---------------------------------------------------------------------------

const RULES = (args && args.rulesPath) || ''
const FILES = (args && args.files) || []
const DOCS_ROOTS = (args && args.docsRoots) || ['docs/']
const SCOPE = (args && args.scope) || 'the reviewed scope'

const VERDICTS = [
  'promote-to-name',
  'promote-to-signature',
  'promote-to-annotation',
  'dedupe-to-reference',
  'promote-to-doc',
  'tighten',
  'delete',
  'keep',
]

const readRules = RULES
  ? `Read ${RULES} first and apply it as your rules.`
  : 'Apply the expression ladder: identifier, then signature and types, then the declaration doc annotation, then inline comment.'

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'verdict', 'reason'],
        properties: {
          line: { type: 'integer', description: '1-indexed line the comment starts on' },
          verdict: { type: 'string', enum: VERDICTS },
          reason: { type: 'string', description: 'one sentence' },
          replacement: {
            type: 'string',
            description:
              'the new name, type or parameter change, target declaration, reference target, or rewritten text; required for every verdict except keep and delete',
          },
          wrongAboutCode: {
            type: 'boolean',
            description: 'true when the comment is factually wrong about the code beneath it',
          },
          concept: {
            type: 'string',
            description: 'promote-to-doc only: the mechanism the comment explains',
          },
        },
      },
    },
  },
}

const DEDUPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['groups', 'docResolutions'],
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fact', 'home', 'members'],
        properties: {
          fact: { type: 'string', description: 'the one fact these comments all explain' },
          home: {
            type: 'string',
            description: 'canonical home as a relative path and symbol, or a wikilink',
          },
          members: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['path', 'line', 'reference'],
              properties: {
                path: { type: 'string' },
                line: { type: 'integer' },
                reference: {
                  type: 'string',
                  description: 'the one-line reference text this site should carry instead',
                },
              },
            },
          },
        },
      },
    },
    docResolutions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'line', 'concept', 'documented'],
        properties: {
          path: { type: 'string' },
          line: { type: 'integer' },
          concept: { type: 'string' },
          documented: { type: 'boolean' },
          target: {
            type: 'string',
            description: 'documented=true: the wikilink or relative path that already covers it',
          },
          reference: {
            type: 'string',
            description: 'documented=true: the one-line reference text to leave in the file',
          },
          entityKind: {
            type: 'string',
            description:
              'documented=false: the entity kind that should own it (standard, decision, principle, doc)',
          },
        },
      },
    },
  },
}

const DEFEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['defended', 'reason'],
  properties: {
    defended: {
      type: 'boolean',
      description:
        'true when the fact is not deducible from the code, or the named home does not contain it',
    },
    reason: { type: 'string' },
    downgrade: { type: 'string', enum: ['tighten', 'keep'] },
    replacement: { type: 'string', description: 'downgrade=tighten: the shorter text to keep' },
  },
}

function judgePrompt(file) {
  return [
    `You are reviewing the comments in one file as part of a comment pass over ${SCOPE}.`,
    readRules,
    '',
    `File: ${file.path}`,
    'Comments under review (line, enclosing declaration, verbatim text):',
    file.comments
      .map((c) => `  - line ${c.line}${c.declaration ? ` in ${c.declaration}` : ''}: ${c.text}`)
      .join('\n'),
    '',
    'Read the file. For each comment return exactly one verdict from the enum. Every' +
      ' verdict except keep and delete must carry a concrete replacement: the new' +
      ' identifier, the type or parameter change, the target declaration, the' +
      ' reference target, or the rewritten text. A verdict you cannot make concrete' +
      ' is keep.',
    'A comment that is factually wrong about the code beneath it is delete or' +
      ' tighten with the correction, and wrongAboutCode=true.',
    'A comment whose fact you cannot place is keep. Not understanding it is' +
      ' evidence it carries something.',
    'For promote-to-doc, fill concept with the mechanism the comment explains;' +
      ' the next stage decides whether a document already covers it.',
  ].join('\n')
}

function dedupePrompt(judged) {
  const inventory = judged
    .flatMap((f) =>
      f.verdicts.map(
        (v) =>
          `  - ${f.path}:${v.line} [${v.verdict}] ${v.comment}${v.concept ? ` (concept: ${v.concept})` : ''}`,
      ),
    )
    .join('\n')
  return [
    `You are the cross-file pass of a comment review over ${SCOPE}.`,
    readRules,
    '',
    'Every comment in scope, with the verdict its per-file judge gave it:',
    inventory,
    '',
    'Task 1: report groups of comments that explain the same fact in different' +
      ' places. Two comments about the same subject that each carry a distinct local' +
      ' fact are not a group. For each group name the canonical home and the' +
      ' one-line reference each other site should carry. Read the home before naming' +
      ' it and confirm it states the fact.',
    `Task 2: for every promote-to-doc verdict, search ${DOCS_ROOTS.join(', ')} and the` +
      ' project conventions for the concept. Return documented=true with the target' +
      ' and reference text when a document already says it, or documented=false with' +
      ' the entity kind that should own it. Do not write documentation.',
    'Empty lists are a correct answer.',
  ].join('\n')
}

function defendPrompt(path, v) {
  return [
    `You are defending one comment that a comment review over ${SCOPE} marked ${v.verdict}.`,
    `File: ${path}, line ${v.line}.`,
    `Comment: ${v.comment}`,
    `Verdict reason: ${v.reason}`,
    v.replacement ? `Named canonical home: ${v.replacement}` : '',
    '',
    'Read the code around the comment as if the comment were gone. Argue that the' +
      ' fact it carries is not deducible from the code, or that the named home does' +
      ' not actually contain it. Return defended=true when either holds, and when you' +
      ' are uncertain. Losing a hard-won fact is invisible afterwards; leaving a' +
      ' redundant comment is not.',
    'With defended=true, set downgrade to tighten and give the shorter replacement' +
      ' text when part of the comment still restates the code, or keep otherwise.',
  ]
    .filter(Boolean)
    .join('\n')
}

async function judgeFile(file) {
  const out = await agent(judgePrompt(file), {
    label: `judge:${file.path}`,
    phase: 'Judge',
    schema: JUDGE_SCHEMA,
  })
  const byLine = new Map(file.comments.map((c) => [c.line, c]))
  const verdicts = ((out && out.verdicts) || [])
    .filter((v) => byLine.has(v.line))
    .map((v) => ({ ...v, comment: byLine.get(v.line).text }))
  // A comment the judge skipped, or a judge that failed outright, is unjudged.
  // It rides back as keep so the apply step never touches it.
  for (const c of file.comments) {
    if (!verdicts.some((v) => v.line === c.line)) {
      verdicts.push({
        line: c.line,
        verdict: 'keep',
        reason: out ? 'judge returned no verdict for this comment' : 'judge failed',
        comment: c.text,
        unjudged: true,
      })
    }
  }
  return { path: file.path, verdicts }
}

function mergeDedupe(judged, dedupe) {
  const groups = (dedupe && dedupe.groups) || []
  const resolutions = (dedupe && dedupe.docResolutions) || []
  const docGaps = []
  for (const g of groups) {
    for (const m of g.members) {
      const f = judged.find((j) => j.path === m.path)
      const v = f && f.verdicts.find((x) => x.line === m.line)
      if (!v || v.verdict === 'delete') continue
      v.verdict = 'dedupe-to-reference'
      v.replacement = m.reference
      v.home = g.home
      v.reason = `duplicates "${g.fact}" — canonical home ${g.home}`
    }
  }
  for (const r of resolutions) {
    const f = judged.find((j) => j.path === r.path)
    const v = f && f.verdicts.find((x) => x.line === r.line)
    if (!v) continue
    if (r.documented) {
      v.verdict = 'dedupe-to-reference'
      v.replacement = r.reference
      v.home = r.target
      v.reason = `concept already documented at ${r.target}`
    } else {
      v.verdict = 'keep'
      v.reason = `documentation gap: ${r.concept} has no home yet`
      docGaps.push({ path: r.path, line: r.line, concept: r.concept, entityKind: r.entityKind })
    }
  }
  // A promote-to-doc the dedupe agent never resolved has nowhere to point.
  for (const f of judged) {
    for (const v of f.verdicts) {
      if (v.verdict === 'promote-to-doc') {
        v.verdict = 'keep'
        v.reason = 'promote-to-doc left unresolved by the dedupe pass'
        docGaps.push({
          path: f.path,
          line: v.line,
          concept: v.concept || v.comment,
          entityKind: 'unknown',
        })
      }
    }
  }
  return { judged, docGaps, homes: groups.map((g) => ({ fact: g.fact, home: g.home })) }
}

async function defendFile(file) {
  const contested = file.verdicts.filter(
    (v) => v.verdict === 'delete' || v.verdict === 'dedupe-to-reference',
  )
  if (contested.length === 0) return file
  await parallel(
    contested.map(
      (v) => () =>
        agent(defendPrompt(file.path, v), {
          label: `defend:${file.path}:${v.line}`,
          phase: 'Defend',
          schema: DEFEND_SCHEMA,
          effort: 'high',
        }).then((d) => {
          // A defender that failed did not lose the argument; uncertainty keeps.
          if (!d || d.defended) {
            v.verdict = d && d.downgrade === 'tighten' && d.replacement ? 'tighten' : 'keep'
            v.replacement = v.verdict === 'tighten' ? d.replacement : undefined
            v.reason = d ? `defended: ${d.reason}` : 'defender failed; kept'
          }
        }),
    ),
  )
  return file
}

if (FILES.length === 0) {
  log('no files supplied — nothing to judge')
  return { files: [], docGaps: [], homes: [] }
}

const commentCount = FILES.reduce((n, f) => n + f.comments.length, 0)
log(`${commentCount} comments across ${FILES.length} files`)

// The dedupe pass needs every verdict at once, so judging ends at a barrier.
const judged = (await parallel(FILES.map((f) => () => judgeFile(f)))).filter(Boolean)

const dedupe = await agent(dedupePrompt(judged), {
  label: 'dedupe:all',
  phase: 'Dedupe',
  schema: DEDUPE_SCHEMA,
})
if (!dedupe)
  log(
    'dedupe pass failed — no cross-file groups applied, promote-to-doc verdicts fall back to keep',
  )

const merged = mergeDedupe(judged, dedupe)
const defended = (await parallel(merged.judged.map((f) => () => defendFile(f)))).filter(Boolean)

const counts = {}
for (const v of VERDICTS) counts[v] = 0
for (const f of defended) for (const v of f.verdicts) counts[v.verdict] += 1
log(
  `verdicts: ${VERDICTS.filter((v) => counts[v])
    .map((v) => `${v}=${counts[v]}`)
    .join(' ')}`,
)

return { files: defended, docGaps: merged.docGaps, homes: merged.homes, counts }
