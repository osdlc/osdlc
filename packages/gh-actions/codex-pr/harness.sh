# Sourced by pr-common/ask.sh. Runs codex exec once with $KEY.
#
# Auth: `codex exec` reads the key from CODEX_API_KEY (OPENAI_API_KEY is
# ignored by exec: it fails with "Missing bearer or basic authentication").
# The action's secret is the usual OPENAI_API_KEY; it is passed as CODEX_API_KEY.
# Read-only: --sandbox read-only (no writes, no network). Codex has no turn
# limit flag, so max-turns does not exist here; the job's timeout-minutes bounds a run.

HARNESS_OFFLINE=1

harness_review_intro() {
  # Plugin skills are called $plugin:skill in codex (agent-adapt skill_call).
  echo "the \$craft:code-review skill with base origin/$1"
}

harness_run() {
  local d="${RUNNER_TEMP:-/tmp}/codex-pr-run" status
  mkdir -p "$d"
  : > "$d/events"; : > "$d/err"; : > "$d/last"
  # GH_TOKEN stays out of the agent's environment: the sandbox has no network
  # anyway, and the token can post comments.
  printf '%s' "$PROMPT" | env -u GH_TOKEN -u GITHUB_TOKEN CODEX_API_KEY="$KEY" \
    codex exec --json --ephemeral --color never --sandbox read-only \
    --output-last-message "$d/last" ${MODEL:+-m "$MODEL"} - > "$d/events" 2> "$d/err"
  status=$?
  # Fold the JSONL events into {is_error, result, auth_failed}. A failed turn
  # carries the API error text; a 401 there (or in stderr) is an authentication
  # failure. The key is cut out of anything posted.
  jq -R 'fromjson? | select(type == "object")' "$d/events" | jq -s \
    --rawfile last "$d/last" --rawfile err "$d/err" --arg k "$KEY" --argjson st "$status" '
      (map(select(.type == "turn.failed") | .error.message) | last) as $failed
      | ($last | gsub("^\\s+|\\s+$"; "")) as $msg
      | ($err | split("\n") | map(select(length > 0)) | last // "") as $tail
      | ($failed // (if $st != 0 then $tail else null end)) as $errtext
      | (($failed != null) or $st != 0 or $msg == "") as $bad
      | {is_error: $bad,
         result: (if $bad then ($errtext // "codex produced no answer") else $msg end),
         auth_failed: ($bad and (($errtext // "") | test("401 Unauthorized|invalid_api_key|Incorrect API key|Missing bearer|not logged in"; "i")))}
      | .result |= (split($k) | join("***"))' > "$RESULT"
  if [ "$status" -eq 0 ] && ! jq -e '.is_error == false' "$RESULT" > /dev/null 2>&1; then status=1; fi
  return "$status"
}
