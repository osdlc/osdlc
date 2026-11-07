/**
 * The full reference `--help --extended` prints: what every option means,
 * the words the report uses, and which combinations are refused. The README
 * says the same in its own layout; keep the two in step.
 */

const TARGETS = `Targets
  A target is what to sweep:
    a checkout            that repository; a linked worktree sweeps the repository it belongs to
    a directory           every checkout found under it, three levels deep at most
    a remote URL          its remote branches only, through a clone kept in the cache
                          directory (https://, ssh://, file://, or user@host:path)
  No target sweeps the checkout you are in. A target never fans out further than
  it says.`

const SWEEP = `Sweep options (the report, plan and clean)
  --remote                Also judge remote branches. Turns on the network: fetches
                          each remote first and asks GitHub or GitLab about pull
                          requests. Slower.
  --offline               With --remote: do not fetch; judge against the
                          remote-tracking refs already on disk, remote branches
                          included. The remote is not contacted.
  --only <kinds>          Only these kinds of row: worktree, branch, remote,
                          comma-separated. Default: worktree,branch, plus remote with
                          --remote. Naming remote implies --remote.
  --branch <name|HEAD>    Only the rows of one branch: its worktree, its local branch,
                          and its remote branch with --remote. HEAD is the branch
                          checked out at the target. Never the default branch.
  --against <remote>      The remote whose default branch counts as "merged into".
                          Default: origin, then the first remote.
  --provider <name>       With --remote: where pull requests come from. auto (by the
                          remote's host), github, gitlab, or none to judge on git
                          evidence alone.
  --no-progress           No progress line on stderr.`

const REPORT = `The report: repo-cleaner [target...]
  Deletes nothing. Lists each row with its verdict, why, the risks it carries,
  and the command that would delete it.
  --all                   Also show keep rows. By default only delete, review and
                          blocked rows are listed. Only with --format text.
  --format text           The report. The default.
  --format summary        Counts per repository: total, merged, delete, prune,
                          review, blocked, keep.
  --format commands       Only the commands of delete rows that carry no risk.
  --format json           Everything, evidence included, for scripts.`

const PLAN = `repo-cleaner plan [target...]
  Sweeps and saves every row, each with a fingerprint of the evidence behind its
  verdict, so it can be reviewed now and run later with clean --plan.
  -o, --out <file>        Where the plan goes; - (the default) is stdout.`

const CLEAN = `repo-cleaner clean [target...]
  Sweeps (or reads --plan), checks every row again, shows the steps, asks, then
  deletes, compare-and-swap, verifying each step and stopping at the first failure.
  Without --pick it runs every row judged delete.
  --pick <row>            Work on exactly these rows. Narrows the run to them, and opts
                          in review rows and kept rows with an action (an open pull
                          request), which never run otherwise. A picked row still
                          needs --allow for its risks. A blocked row is skipped.
                          Repeatable.
  --spare <row>           Leave this row alone, and make sure it is what you saw. A
                          spared row is not deleted, even if it is judged delete. A
                          spared remote branch is still checked: if it is gone or its
                          tip moved since the plan, the run stops before deleting
                          anything. Sparing a worktree also spares its branch.
                          Repeatable.
  --allow <risk>          Accept this risk for every row that carries it.
  --allow <risk>=<row>    Accept it for that one row only.
  --plan <file|->         Run a saved plan instead of sweeping now (- reads stdin).
                          Rows whose evidence changed since the plan are dropped.
  -y, --yes               Do not ask. Without it, and with no terminal to ask on,
                          clean refuses.
  --dry-run               Check and show the steps, then stop.
  --receipt <file>        Write a record of every step, rewritten after each one.
                          Default: next to a --plan file; none otherwise.
  --format text|json      How the steps and the outcome are shown.`

const CACHE = `repo-cleaner cache [list | remove <url>... | remove --all]
  Lists or removes the clones kept for remote URL targets. A removed clone is
  cloned again by the next sweep of its URL; a plan that names it cannot run.`

const WORDS = `Rows
  One thing that could be deleted, named <kind>:<name>:
    worktree:<path>         a linked worktree: removed with git worktree remove, or,
                            when its directory is already gone, its record pruned
    branch:<name>           a local branch, deleted with git update-ref -d <sha>
    remote:<remote>/<name>  a branch on a remote, deleted by a push with a lease
  A bare name or path works when only one row has it.

Verdicts
  delete    Its work is on the default branch, or it is otherwise safe to lose.
            clean deletes it, once its risks are allowed.
  review    The signals are mixed, or it holds work. Deleted only when picked and
            its risks are allowed.
  blocked   Something rules removal out: a lock, a running process, a submodule
            that cannot be read, hidden index flags, a nested repository, a branch
            checked out twice. Never deleted; fix the cause and sweep again.
  keep      Structural (the default branch, the current checkout, the primary
            worktree): never deleted. Or in use (an open pull request): deleted
            only when picked and confirm-open-pr is allowed.
  prune     Shown for a delete row whose worktree directory is already gone: only
            the stale record goes.

Risks (approve each by name with --allow)
  abandon-unmerged   Commits that are not on the default branch, or a worktree's
                     (or its submodules') commits and stashes that no remote has.
  discard-changes    Uncommitted or untracked files in the worktree or any of its
                     submodules.
  confirm-open-pr    The branch has an open pull request; deleting the remote branch
                     closes it.
  A worktree's submodules are part of it: one --allow on the worktree row covers
  the same risk in every submodule.`

const CONFLICTS = `Refused before anything is deleted (exit 2)
  A combination is refused when it contradicts itself, or when one of its options
  would have no effect. Most are refused before anything is swept; a row named
  two ways (a bare name and its id), and an --allow for a row, are checked
  against the plan, after the sweep.
    the same row in --pick and --spare
    --allow <risk>=<row> for a spared row, or for a row outside --pick
    a picked or spared row of a kind --only leaves out
    a picked or spared row that is not one of --branch's rows
    --branch with more than one target, or with a remote URL, or the default branch
    --plan with targets or sweep options: the plan already fixed them
    --plan - without --yes or --dry-run: stdin carries the plan, so nothing can ask
    --yes with --dry-run
    --receipt with --dry-run
    --offline or --provider without --remote
    --remote with an --only that leaves remote out
    a remote URL target with --only worktree or --only branch, with --offline, or
      mixed with checkout targets
    --all with any --format but text

Refused after the sweep, before deleting (exit 1)
    a picked, spared or allowed row the plan does not have
    a row name that matches rows in more than one repository
    a spared remote branch that is gone or moved since the plan

Allowed, because nothing contradicts
    the same row picked twice: it runs once
    --allow <risk> with --allow <risk>=<row>: the broader one covers it
    --allow for a risk no row that runs carries: the preview lists it as unused
    picking a blocked or keep row: it is skipped and shown with the reason
    --only remote without --remote: asking for remote branches implies the network`

const EXIT = `Exit codes
  0    swept; or clean ran, was declined, or had nothing to do
  1    failed against the state it found: an unreadable plan, a row not in it
  2    cannot run as typed: an unknown flag, a malformed row, a refused combination
  10   no target named a repository
  11   clean stopped at a failed step; the receipt says which`

/** The extended help for each command: its own options, then the shared vocabulary. */
export const REFERENCE = {
  report: [TARGETS, SWEEP, REPORT, WORDS, CONFLICTS, EXIT].join('\n\n'),
  plan: [TARGETS, SWEEP, PLAN, WORDS, EXIT].join('\n\n'),
  clean: [TARGETS, SWEEP, CLEAN, WORDS, CONFLICTS, EXIT].join('\n\n'),
  cache: CACHE,
} as const
