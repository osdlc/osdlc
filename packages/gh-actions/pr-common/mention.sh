#!/usr/bin/env bash
# Prints real=1 to $GITHUB_OUTPUT when $REQUEST mentions @$AGENT outside code
# blocks, inline code and quoted lines, and mode=review when its first line
# starts with `@$AGENT review`, mode=run plus kind=skill|instruction and apply=0|1
# when it starts with `@$AGENT /skill` or is free text with `--apply` (see
# run-request.sh), else mode=answer. $AGENT is claude, codex or cursor.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
: "${AGENT:?AGENT is required}"
if printf '%s\n' "$REQUEST" \
  | perl -0777 -pe 's/```.*?```//gs; s/`[^`\n]*`//g; s/^[ \t]*>.*$//mg' \
  | grep -qE "(^|[^[:alnum:]_/.-])@${AGENT}([^[:alnum:]_-]|\$)"; then
  echo "real=1" >> "$GITHUB_OUTPUT"
  # shellcheck source=/dev/null
  . "$(dirname "$0")/run-request.sh"
  parse_run_request
  if [ "$RUN_KIND" != skill ] && printf '%s\n' "$REQUEST" | head -n 1 | grep -qE "^[[:space:]]*@${AGENT}[[:space:]]+review([[:space:]]|\$)"; then
    echo "mode=review" >> "$GITHUB_OUTPUT"
  elif [ "$RUN_KIND" = answer ]; then
    echo "mode=answer" >> "$GITHUB_OUTPUT"
  else
    { echo "mode=run"; echo "kind=$RUN_KIND"; echo "apply=$RUN_APPLY"; } >> "$GITHUB_OUTPUT"
  fi
else
  echo "Only quoted or code mentions of @$AGENT; nothing to do."
fi
