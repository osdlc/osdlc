# One row per PR in a pr-update report, whether it was acted on or skipped.
# Shared by the job summary and the PR comment so both say the same thing.
#   outcome: updated | up-to-date | conflict | failed | blocked | skipped
#   status:  the word shown to a reader (adds "repaired" and "would update")
def rows:
  ( [ .results[] | {
        number, head, strategy,
        strategyFallback: (.strategyFallback // null),
        pushed,
        outcome: .status,
        status: (if (.repaired // [] | length) > 0 then "repaired"
                 elif .status == "updated" and (.pushed | not) then "would update"
                 else .status end),
        detail: (.detail // ""),
        conflicts: (.conflicts // []),
        repaired: (.repaired // []),
        blockedBy: null } ]
    + [ .skipped[] | {
        number, head, strategy: null, strategyFallback: null, pushed: false,
        outcome: (if (.reason | test("^already up to date")) then "up-to-date"
                  elif (.reason | test("^blocked")) then "blocked"
                  else "skipped" end),
        status: (if (.reason | test("^already up to date")) then "up-to-date"
                 elif (.reason | test("^blocked")) then "blocked"
                 elif (.reason | test("^failed [0-9]+ time")) then "skipped (failed before)"
                 else "skipped" end),
        detail: .reason,
        conflicts: [], repaired: [],
        blockedBy: ((.reason | capture("blocked on #(?<n>[0-9]+)")? // {n: null}) | .n) } ]
    # pr-update 0.10 lists a --pr that matched no open PR in `notFound` (`#N` or
    # `owner/name#N`); earlier versions put it in `skipped`.
    + [ (.notFound // [])[] | capture("#(?<n>[0-9]+)$") | {
        number: (.n | tonumber), head: "", strategy: null, strategyFallback: null,
        pushed: false, outcome: "skipped", status: "skipped",
        detail: "not found in survey", conflicts: [], repaired: [], blockedBy: null } ] )
  | sort_by(.number);
