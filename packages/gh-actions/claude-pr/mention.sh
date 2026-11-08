#!/usr/bin/env bash
# Prints real=1 to $GITHUB_OUTPUT when $REQUEST mentions @claude outside code
# blocks, inline code and quoted lines, and mode=review when its first line
# starts with `@claude review`, else mode=answer.
set -e  # no pipefail: `grep -q` may close a pipe early, as in the workflow it came from
if printf '%s\n' "$REQUEST" \
  | perl -0777 -pe 's/```.*?```//gs; s/`[^`\n]*`//g; s/^[ \t]*>.*$//mg' \
  | grep -qE '(^|[^[:alnum:]_/.-])@claude([^[:alnum:]_-]|$)'; then
  echo "real=1" >> "$GITHUB_OUTPUT"
  if printf '%s\n' "$REQUEST" | head -n 1 | grep -qE '^[[:space:]]*@claude[[:space:]]+review([[:space:]]|$)'; then
    echo "mode=review" >> "$GITHUB_OUTPUT"
  else
    echo "mode=answer" >> "$GITHUB_OUTPUT"
  fi
else
  echo "Only quoted or code mentions of @claude; nothing to do."
fi
