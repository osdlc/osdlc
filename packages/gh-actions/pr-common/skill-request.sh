# Sourced by mention.sh, ask.sh, apply.sh and post.sh. parse_skill_request reads
# $AGENT and $REQUEST (first line `@AGENT /<plugin>:<skill> [args...] [--apply]`)
# and sets
#   SKILL_TOKEN    the word after the mention, as typed (starts with /)
#   SKILL_NAME     the name without the leading slash, empty when invalid
#   SKILL_ARGS     the rest of the first line, `--apply` removed, trimmed
#   SKILL_APPLY    1 when `--apply` was among the args, else 0
#   SKILL_EXTRA    every line after the first
# The comment text is only ever data: it is split here, never evaluated.
parse_skill_request() {
  local first rest re='^[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$'
  first=$(printf '%s\n' "$REQUEST" | head -n 1 | tr -d '\r')
  SKILL_EXTRA=$(printf '%s\n' "$REQUEST" | tr -d '\r' | sed 1d)
  rest=$(printf '%s' "$first" | sed -E "s/^[[:space:]]*@$AGENT[[:space:]]+//")
  SKILL_TOKEN=${rest%%[[:space:]]*}
  SKILL_ARGS=${rest#"$SKILL_TOKEN"}
  SKILL_APPLY=0
  if printf ' %s ' "$SKILL_ARGS" | grep -qE '[[:space:]]--apply[[:space:]]'; then SKILL_APPLY=1; fi
  SKILL_ARGS=$(printf ' %s ' "$SKILL_ARGS" | perl -pe 's/(?<=\s)--apply(?=\s)//g; s/^\s+|\s+$//g')
  SKILL_NAME=${SKILL_TOKEN#/}
  if ! [[ $SKILL_NAME =~ $re ]]; then SKILL_NAME=""; fi
}
