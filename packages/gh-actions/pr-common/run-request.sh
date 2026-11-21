# parse_run_request reads
# $AGENT and $REQUEST and sets RUN_KIND to one of
#   skill        first line `@AGENT /<plugin>:<skill> [args...] [--apply]`, the
#                name valid; any other first word (such as `/etc/hosts`) is free text
#   instruction  first line `@AGENT <free text> --apply`: not a /skill, and with a
#                standalone `--apply`; the rest of the comment is the instruction
#   answer       anything else (including free text without `--apply`)
# and sets
#   RUN_APPLY        1 when `--apply` was on the first line, else 0 (always 1 for an instruction)
#   RUN_EXTRA        every line after the first
#   RUN_INSTRUCTION  instruction kind: the first line's text with `--apply` removed,
#                    then RUN_EXTRA, trimmed
#   SKILL_TOKEN      skill kind: the word after the mention, as typed (starts with /)
#   SKILL_NAME       the name without the leading slash
#   SKILL_ARGS       the rest of the first line, `--apply` removed, trimmed
# The comment text is only ever data: it is split here, never evaluated.
parse_run_request() {
  local first rest token re='^[A-Za-z0-9_.-]+(:[A-Za-z0-9_.-]+)?$' stripped
  first=$(printf '%s\n' "$REQUEST" | head -n 1 | tr -d '\r')
  RUN_EXTRA=$(printf '%s\n' "$REQUEST" | tr -d '\r' | sed 1d)
  rest=$(printf '%s' "$first" | sed -E "s/^[[:space:]]*@$AGENT[[:space:]]+//")
  RUN_KIND=answer RUN_APPLY=0 RUN_INSTRUCTION="" SKILL_TOKEN="" SKILL_NAME="" SKILL_ARGS=""
  if printf ' %s ' "$rest" | grep -qE '[[:space:]]--apply[[:space:]]'; then RUN_APPLY=1; fi
  stripped=$(printf ' %s ' "$rest" | perl -pe 's/(?<=\s)--apply(?=\s)//g; s/^\s+|\s+$//g')
  token=${rest%%[[:space:]]*}
  if [[ $token == /* ]] && [[ ${token#/} =~ $re ]]; then
    RUN_KIND=skill
    SKILL_TOKEN=$token
    SKILL_ARGS=$(printf ' %s ' "${rest#"$SKILL_TOKEN"}" | perl -pe 's/(?<=\s)--apply(?=\s)//g; s/^\s+|\s+$//g')
    SKILL_NAME=${SKILL_TOKEN#/}
  elif [ "$RUN_APPLY" = 1 ]; then
    RUN_INSTRUCTION=$(printf '%s\n%s\n' "$stripped" "$RUN_EXTRA" | perl -0777 -pe 's/^\s+|\s+$//g')
    if [ -n "$RUN_INSTRUCTION" ]; then RUN_KIND=instruction; else RUN_APPLY=0; fi
  fi
}
