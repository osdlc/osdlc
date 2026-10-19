export const meta = {
  name: 'bug-finder-fix',
  description:
    "Fix each territory's confirmed bugs in its own worktree, verify the fixes with fresh agents, and land one PR per territory",
  phases: [
    {
      title: 'Fix',
      detail: "one agent per territory, working only inside that territory's worktree",
    },
    {
      title: 'Verify fix',
      detail: 'a fresh agent re-reads the diff and runs the project quality checks',
    },
    { title: 'Land', detail: 'one commit, one push, one PR per module boundary' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs from /sdlc:bug-finder Step 6:
//   { territories: [{ id, name, worktree, branch, findings: [...] }],
//     mode, repoRoot, sdlc, baseBranch }
// `sdlc` is the resolved `${CLAUDE_PLUGIN_ROOT}/cli/sdlc` launcher path.
// ---------------------------------------------------------------------------

const TERRITORIES = (args && args.territories) || []
const BOMB = !!(args && args.mode === 'bomb')
const REPO_ROOT = (args && args.repoRoot) || '.'
const SDLC = (args && args.sdlc) || 'sdlc'
const BASE = (args && args.baseBranch) || 'main'
const REPAIR_ROUNDS = BOMB ? 2 : 1

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['applied', 'changedFiles'],
  properties: {
    applied: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'file', 'status', 'note'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'skipped', 'not-a-bug'] },
          note: { type: 'string', description: 'what changed, or why it was skipped' },
          test: {
            type: 'string',
            description:
              'path::name of the regression test added for this fix, or why none could be added',
          },
          testFails: {
            type: 'boolean',
            description:
              'true only if you ran the new test against the UNFIXED code and watched it fail',
          },
        },
      },
    },
    changedFiles: { type: 'array', items: { type: 'string' } },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['perFinding', 'qualityOk', 'regressionRisk'],
  properties: {
    perFinding: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'fixed', 'reason', 'testPins'],
        properties: {
          title: { type: 'string' },
          fixed: { type: 'boolean' },
          reason: { type: 'string' },
          testPins: {
            type: 'boolean',
            description: 'you reverted the fix, ran the new test, and saw it fail',
          },
        },
      },
    },
    qualityOk: { type: 'boolean' },
    qualityOutput: {
      type: 'string',
      description: 'the failing check names and their output, empty when clean',
    },
    regressionRisk: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'concern'],
        properties: { file: { type: 'string' }, concern: { type: 'string' } },
      },
    },
  },
}

const LAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['landed'],
  properties: {
    landed: { type: 'boolean' },
    prUrl: { type: 'string' },
    commit: { type: 'string' },
    reason: { type: 'string', description: 'why nothing was landed, when landed is false' },
  },
}

function renderFindings(findings) {
  return findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity}] ${f.file}:${f.line} — ${f.title}\n` +
        `   mechanism: ${f.why}\n` +
        `   failure: ${f.failureScenario}\n` +
        (f.fixSketch ? `   sketch: ${f.fixSketch}\n` : ''),
    )
    .join('')
}

function fixPrompt(t, findings, priorFeedback) {
  return [
    `Fix confirmed bugs inside ONE worktree. Work only under: ${t.worktree}`,
    'Use absolute paths rooted at that worktree. Never touch a file outside it, and never' +
      ' run a git command against any other checkout.',
    '',
    `Territory: ${t.name} (\`${t.id}\`). Confirmed findings:`,
    renderFindings(findings),
    priorFeedback
      ? `\nA previous attempt was verified and came back incomplete. Address this feedback:\n${priorFeedback}\n`
      : '',
    'Rules:',
    '- Smallest correct change. Fix the defect, not the design around it.',
    '- One finding at a time. Re-read the surrounding code before editing.',
    '- If a finding turns out not to be a bug once you have the file open, mark it' +
      ' `not-a-bug` and change nothing. That is a good outcome, not a failure.',
    '- If a fix would require a behaviour change a reviewer should decide, mark it' +
      ' `skipped` with the reason and leave the code alone.',
    '- Update any comment your change makes inaccurate.',
    '- EVERY fix ships a regression test. Write it FIRST, run it against the' +
      ' unfixed code, and watch it FAIL — a test that passes before your change' +
      ' does not pin anything. Then fix, and watch it pass. Report the test as' +
      ' `path::name` and set `testFails: true` only if you actually saw the' +
      ' red. Follow the conventions of the test files already in this package;' +
      ' if there are none, add the smallest suite the package can run.',
    "- USE THE PACKAGE'S OWN RUNNER. This monorepo is mixed: read" +
      ' `<package>/package.json` `scripts.test` and run exactly that. A vitest' +
      ' package supplies a DOM environment from its own config, so running its' +
      ' suite under `bun test` dies with `document is not defined` — a runner' +
      ' artifact that looks exactly like a broken fix. If the package declares no' +
      ' test script, find the runner its siblings use before inventing one.',
    '- If a fix genuinely cannot be tested (a build-config or packaging defect,' +
      ' say), put the reason in `test` and leave `testFails` false. That is a' +
      ' real answer; a missing test with no reason is not.',
    "- RUN THE PACKAGE'S TYPECHECK TOO, not just its tests. `scripts.typecheck`" +
      ' is a separate CI gate from `scripts.test`, and a test file that passes' +
      ' at runtime can still fail `tsc` — a cast between types that do not' +
      ' overlap, a callback typed for an argument nothing passes. A green suite' +
      ' is half the gate.',
    '- A TEST BELONGS IN THE PACKAGE THAT OWNS THE CODE IT PINS. If the defect is' +
      ' in another package, fix it there and put its test there too. Never reach' +
      " into a dependency by mocking a bare specifier the test's own package" +
      ' does not declare: that intercepts the module only if both packages' +
      ' resolve to the same copy, which is an install detail rather than' +
      ' something the suite decides — it passes locally and silently mocks' +
      ' nothing in CI. Mock the relative path the code under test imports.',
    '- WAIT FOR THE CONDITION, NOT FOR A TICK COUNT. A fixed number of' +
      ' `nextTick`/`setTimeout` rounds is a race with whatever the code awaits —' +
      ' a lazy import especially — and a loaded CI runner wins it. Poll until' +
      ' the thing you are asserting is true, with a bounded ceiling that throws a' +
      ' message naming what never arrived. Keep a fixed drain only where the' +
      ' assertion is that nothing arrives.',
    '- Do NOT commit, stage, push, or open a PR. Leave the changes in the working tree.',
  ]
    .filter(Boolean)
    .join('\n')
}

function verifyPrompt(t, findings, fixResult) {
  return [
    `Verify a set of bug fixes. Worktree: ${t.worktree}. Read the diff first:`,
    `  git -C ${t.worktree} diff`,
    '',
    'You did not write these changes. Judge them adversarially.',
    '',
    'Findings the changes were supposed to fix:',
    renderFindings(findings),
    'What the fixing agent reported:',
    JSON.stringify(fixResult.applied, null, 2),
    '',
    'For each finding, decide whether the defect is ACTUALLY gone in the current source —' +
      ' read the code, do not trust the report. A finding the fixer marked `not-a-bug` or' +
      ' `skipped` counts as `fixed: true` only if you independently agree with that call;' +
      ' otherwise `fixed: false` with the reason.',
    '',
    'For each finding, VERIFY THE REGRESSION TEST rather than trusting the report:' +
      ' revert the fix in your working copy (keep the test), run the test, and' +
      ' confirm it FAILS; then restore the fix and confirm it passes. Set' +
      ' `testPins` from what you observed. A test that passes with the fix' +
      ' reverted pins nothing and the finding is not fixed.',
    '',
    "Run it with the runner this package's `package.json` `scripts.test` names," +
      ' not the one the repo uses elsewhere. A suite red from the wrong runner is' +
      ' evidence of nothing — before recording a failure, confirm it names the' +
      ' assertion you wrote.',
    '',
    'Then look at the whole diff for regressions it introduces: a changed contract a caller' +
      ' still assumes, a narrowed condition that now drops a valid case, a swallowed error,' +
      ' a comment left inaccurate. Report each as a `regressionRisk` entry.',
    '',
    'Finally run the project quality checks against this worktree and report the result:',
    `  ${SDLC} quality run --config ${REPO_ROOT}/sdlc.yaml --project-root ${t.worktree}`,
    'Set `qualityOk` from that exit code, and put the failing check names and their output in' +
      ' `qualityOutput`. If the checks cannot run at all, set `qualityOk: false` and say so.',
  ].join('\n')
}

function landPrompt(t, findings, verify) {
  return [
    `Land one module-boundary PR. Worktree: ${t.worktree}. Branch: ${t.branch}. Base: ${BASE}.`,
    '',
    `1. Confirm the diff is confined to this territory: \`git -C ${t.worktree} status --porcelain\`.`,
    '   Every changed path must sit inside the territory:',
    t.paths.map((p) => `     - ${p}`).join('\n'),
    '   If anything else changed, stop and return `landed: false` with the reason.',
    `2. Stage those paths explicitly — never \`git add -A\`, never \`git add .\`.`,
    '3. Commit once, through the commit verb (it routes the message safely):',
    `     ${SDLC} commit create --project-root ${t.worktree} --message - <<'MSG'`,
    `     fix(${t.id}): <one line naming the class of defect fixed>`,
    '',
    '     <one bullet per fixed finding: file:line — what was wrong, what changed>',
    '     MSG',
    `4. Push once: \`git -C ${t.worktree} push -u origin ${t.branch}\`.`,
    '   ONE push. Every extra push is another full CI run — batch everything into this one.',
    `5. Open the PR with \`sdlc pr create --base ${BASE} --head ${t.branch} --title <title> --body-file <file>\` from ${t.worktree}.`,
    '',
    'PR body shape:',
    '  ## Summary — the territory, and the class of bugs fixed.',
    '  ## Fixed — one bullet per finding: `file:line` — mechanism, failure scenario, the fix.',
    '  ## Not fixed — findings marked skipped or not-a-bug, with the reason.',
    '  ## Regression tests — one row per fix: the test `path::name`, and confirmation' +
      ' it was seen to fail with the fix reverted.',
    '  ## Verification — the quality-check result, and the regression risks the verifier raised.',
    '  ## How this was generated — `/sdlc:bug-finder`, scan → validate → fix → verify-fix.',
    '',
    'Facts to use, verbatim:',
    renderFindings(findings),
    `Verifier result: ${JSON.stringify(verify)}`,
    '',
    'Return the PR URL. If there is no diff to land, return `landed: false` and open nothing.',
  ].join('\n')
}

async function fixTerritory(t) {
  const findings = t.findings || []
  if (findings.length === 0) return { territory: t, skip: 'no findings' }
  const result = await agent(fixPrompt(t, findings, null), {
    label: `fix:${t.id}`,
    phase: 'Fix',
    schema: FIX_SCHEMA,
    effort: 'high',
  })
  if (!result) return { territory: t, skip: 'fix agent returned nothing' }
  return { territory: t, findings, fixResult: result }
}

async function verifyTerritory(prev) {
  if (!prev || prev.skip) return prev
  const t = prev.territory
  let fixResult = prev.fixResult
  let verify = null
  for (let round = 0; round <= REPAIR_ROUNDS; round += 1) {
    verify = await agent(verifyPrompt(t, prev.findings, fixResult), {
      label: `verify:${t.id}:r${round + 1}`,
      phase: 'Verify fix',
      schema: VERIFY_SCHEMA,
      effort: 'high',
    })
    if (!verify) return { territory: t, skip: 'verify agent returned nothing' }
    // A fix whose test does not fail without it is unpinned — treat it like an
    // unfixed finding so the repair round adds a test that actually bites.
    const unfixed = (verify.perFinding || []).filter((p) => !p.fixed || !p.testPins)
    if (unfixed.length === 0 && verify.qualityOk) break
    if (round === REPAIR_ROUNDS) {
      log(
        `${t.id}: still ${unfixed.length} unfixed and qualityOk=${verify.qualityOk} after ${REPAIR_ROUNDS} repair round(s) — landing only what verified`,
      )
      break
    }
    const feedback = [
      unfixed
        .map((p) =>
          p.fixed
            ? `- TEST DOES NOT PIN: ${p.title} — the test still passes with the fix reverted. Write one that fails without it.`
            : `- NOT FIXED: ${p.title} — ${p.reason}`,
        )
        .join('\n'),
      verify.qualityOk
        ? ''
        : `- QUALITY CHECKS FAILING:\n${verify.qualityOutput || '(no output captured)'}`,
      (verify.regressionRisk || [])
        .map((r) => `- REGRESSION RISK: ${r.file} — ${r.concern}`)
        .join('\n'),
    ]
      .filter(Boolean)
      .join('\n')
    const repaired = await agent(fixPrompt(t, prev.findings, feedback), {
      label: `fix:${t.id}:repair${round + 1}`,
      phase: 'Fix',
      schema: FIX_SCHEMA,
      effort: 'high',
    })
    if (!repaired) break
    fixResult = repaired
  }
  return { territory: t, findings: prev.findings, fixResult, verify }
}

async function landTerritory(prev) {
  if (!prev || prev.skip)
    return {
      id: prev && prev.territory ? prev.territory.id : 'unknown',
      landed: false,
      reason: prev ? prev.skip : 'no result',
    }
  const t = prev.territory
  const verified = (prev.verify.perFinding || []).filter((p) => p.fixed && p.testPins)
  if (verified.length === 0) {
    log(`${t.id}: nothing verified — no PR opened`)
    return { id: t.id, landed: false, reason: 'no finding verified as fixed' }
  }
  const result = await agent(landPrompt(t, prev.findings, prev.verify), {
    label: `land:${t.id}`,
    phase: 'Land',
    schema: LAND_SCHEMA,
    effort: 'medium',
  })
  if (!result) return { id: t.id, landed: false, reason: 'land agent returned nothing' }
  return { id: t.id, name: t.name, branch: t.branch, paths: t.paths, ...result }
}

if (TERRITORIES.length === 0) {
  log('no territories with confirmed findings — nothing to fix')
  return { landed: [] }
}

log(
  `fixing ${TERRITORIES.length} territories, mode=${BOMB ? 'bomb' : 'normal'}, ${REPAIR_ROUNDS} repair round(s)`,
)

const landed = await pipeline(TERRITORIES, fixTerritory, verifyTerritory, landTerritory)

return { landed: landed.filter(Boolean) }
