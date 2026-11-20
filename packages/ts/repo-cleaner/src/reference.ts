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
  No target sweeps the directory you are in, read the same way; in a subdirectory
  the checkout around it tracks, where the search finds no checkout, that checkout.`

const SWEEP = `What to look at (status, plan and clean)
  --local                 Worktrees and local branches. The default when no scope
                          flag is given. No network, unless --fetch.
  --remote                Branches on the default remote: origin, else the remote the
                          default branch tracks, else the only remote. Fetches it
                          first and looks up pull requests.
  --remote=<name>         Branches on this remote; --remote='*' is every remote.
                          Repeatable, and adds to a bare --remote. Each is fetched,
                          and its branches judged against its own default branch.
  --all                   --local and --remote. With other remotes, write them out:
                          --local --remote=upstream.
  --worktrees             Only worktrees, of the local rows.
  --branches              Only local branches, of the local rows.
  Scope flags add up: --worktrees --remote is worktrees and the default remote's
  branches.

How sure
  --fetch                 Fetch the default remote before judging local rows.
  --offline               No network: no fetch; judge against the remote-tracking
                          refs already on disk. Tips can be stale; clean asks the
                          remote before deleting on it. Pull requests are still
                          looked up; add --provider none for no network at all.
  --against <remote>      Judge every row against this remote's default branch, as
                          a fork against its parent. Without it, a remote's branches
                          are judged against its own default branch, and local rows
                          against the default remote's.
  --provider <name>       With remote rows: where pull requests come from. auto (by
                          each remote's host), github, gitlab, or none to judge on
                          git evidence alone.
  --branch <name|HEAD>    Only the rows of one branch: its worktree, its local branch,
                          and its remote branches. HEAD is the branch checked out at
                          the target. Never a default branch.

What is shown
  --sizes                 Read each worktree's size on disk (du), list rows largest
                          first within each verdict, and total the bytes the delete
                          and review rows would free. Slower: it reads every file
                          under every worktree. Not part of a plan.
  --no-progress           No progress line on stderr.`

const STATUS = `repo-cleaner status [target...]
  Deletes nothing. Lists each row with its verdict, why, the risks it carries,
  and the command that would delete it.
  --all-rows              Also show keep rows. By default only delete, review and
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
  deletes, compare-and-swap, verifying each step. A failed step skips only the
  steps that depend on it. Every row judged delete runs, and each row picked.
  --pick <row>            Also run this row: a review row, or a kept row with an
                          action (an open pull request), never runs otherwise. A
                          picked row still needs --allow for its risks. A blocked
                          row is skipped. Repeatable.
  --spare <row|glob>      Leave this row, or every row the glob matches, alone. A
                          glob matches row names, and a remote branch's name
                          without its remote; * stays within a /, ** does not. A
                          remote branch spared by name is still checked: if its tip
                          moved or it is gone since the plan, the run stops before
                          deleting anything. Sparing a worktree also spares its
                          branch. Repeatable.
  --allow <risk>          Accept this risk for every row that carries it.
  --allow <risk>=<row>    Accept it for that one row only.
  -i, --interactive       Choose the rows from a checklist: delete rows ticked,
                          review rows not, keep and blocked rows shown but not
                          selectable. A ticked row's risks are asked for by name.
                          Needs a terminal.
  --archive               Push unlanded work to an archive branch on the default
                          remote before deleting; then --allow discard-archived
                          stands for abandon-unmerged and discard-changes.
  --archive-exclude <glob>  With --archive, leave these files out of a snapshot.
  --plan <file|->         Clean a saved plan instead of looking now (- reads stdin).
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
  discard-archived   With --archive, stands for abandon-unmerged and discard-changes on
                     a row whose work the archive holds. Files the snapshot leaves out
                     (secret-shaped, --archive-exclude, over 10 MiB) keep discard-changes;
                     a worktree's submodule work keeps both risks.
  confirm-open-pr    The branch has an open pull request, or open pull requests could
                     not be checked (the CLI is missing or signed out, or the listing
                     failed); deleting the remote branch closes it.
  A worktree's submodules are part of it: one --allow on the worktree row covers
  the same risk in every submodule.`

const CONFLICTS = `Refused before anything is deleted (exit 2)
  A combination is refused when it contradicts itself, or when one of its options
  would have no effect. Most are refused before anything is swept; a row named
  two ways (a bare name and its id), and an --allow for a row, are checked
  against the plan, after the sweep.
    no phase named: the bare command explains the phases
    a target that is no directory but a remote's name: write --remote=<name>
    --all with --remote=<name>
    the same row in --pick and --spare
    --allow <risk>=<row> for a spared row
    -i with --pick, or with --plan -
    a picked or spared row of a kind the scope leaves out
    a picked or spared row that is not one of --branch's rows
    --branch with more than one target, or with a remote URL, or a default branch
    --plan with targets, scope flags or sweep options: the plan already fixed them
    --plan - without --yes or --dry-run: stdin carries the plan, so nothing can ask
    --yes with --dry-run
    --receipt with --dry-run
    --fetch with --offline; --fetch with remote rows only
    --offline or --provider without remote rows
    a remote URL target with --worktrees or --branches, with --offline, or mixed
      with checkout targets
    --all-rows with any --format but text

Refused after the sweep, before deleting (exit 1)
    a picked, spared or allowed row the plan does not have
    a row name that matches rows in more than one repository
    a spared remote branch that moved since the plan, or that the re-check no longer finds

A repository that cannot be read is an error row, and the rest are swept
    a remote it does not have, or several remotes and none of them the default
    --against a remote it does not have
    --provider github or gitlab over remotes on different kinds of host

Allowed, because nothing contradicts
    the same row picked twice: it runs once
    --allow <risk> with --allow <risk>=<row>: the broader one covers it
    --allow for a risk no row that runs carries: the preview lists it as unused
    picking a blocked or keep row: it is skipped and shown with the reason
    a --spare glob that matches nothing`

const EXIT = `Exit codes
  0    looked or saved; or clean ran, was declined, or had nothing to do
  1    failed against the state it found: an unreadable plan, a row not in it
  2    cannot run as typed: no phase named, an unknown flag, a malformed row, a
       refused combination
  10   no target named a repository
  11   clean had a failed step; the receipt says which, and which steps it skipped`

/** The extended help for each command: its own options, then the shared vocabulary. */
export const REFERENCE = {
  status: [TARGETS, SWEEP, STATUS, WORDS, CONFLICTS, EXIT].join('\n\n'),
  plan: [TARGETS, SWEEP, PLAN, WORDS, EXIT].join('\n\n'),
  clean: [TARGETS, SWEEP, CLEAN, WORDS, CONFLICTS, EXIT].join('\n\n'),
  cache: CACHE,
} as const
