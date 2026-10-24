/**
 * The prompt every repair agent gets.
 *
 * One prompt for every agent, and for a host that binds `repair` to its own
 * agent runner, so the rules the executor checks (`execute.ts`) are stated the
 * same way wherever the agent runs. The agent is told what is wrong and what it
 * may not do. The executor stages, commits, verifies and pushes.
 */

import type { RepairRequest } from '../ports.ts'

const TASK: Record<RepairRequest['kind'], string> = {
  conflict:
    `Merging the base branch into the pull request's branch stopped on conflicts that no ` +
    `automatic rule could resolve. The merge is open in your working directory and the ` +
    `conflicted files hold conflict markers. Resolve each conflict so the result keeps what ` +
    `both sides intended, and remove every marker.`,
  'verify-failed':
    `The pull request's branch was brought up to date with its base, but the checks that must ` +
    `pass before it is pushed now fail. Fix the cause in the files so they pass.`,
}

/**
 * The instruction for one repair: what happened, which files to look at, and
 * the rules the result is checked against.
 */
export function repairPrompt(req: RepairRequest): string {
  const files = req.paths.length === 0 ? '(none listed)' : req.paths.map((p) => `- ${p}`).join('\n')
  return [
    `You are repairing pull request #${req.pr}: branch \`${req.head}\` is being updated onto \`${req.base}\`.`,
    '',
    TASK[req.kind],
    '',
    'What went wrong:',
    req.reason,
    '',
    req.kind === 'conflict' ? 'Conflicted files:' : 'Files the update changed:',
    files,
    '',
    'Rules. Your work is checked against them and rejected if any is broken:',
    '- Edit files in this working directory only.',
    '- Do not commit, amend, merge, rebase, cherry-pick, push, switch branches, or create any branch, tag or other ref. The caller stages and commits what you leave.',
    '- Leave no conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in any file.',
    '- Leave no whitespace errors: `git diff --check` must be clean.',
    '- Change only what the problem needs. Do not reformat or refactor other code.',
    '- If you cannot fix it with confidence, change nothing and say why.',
    '',
    'Finish with one line saying what you did. That line is recorded as the repair note.',
  ].join('\n')
}
