# Sourced by story-shots.sh. Kept apart so tests/platform.test.ts can call it
# without Docker.

# platform_matches CACHED WANTED: whether an image cached as CACHED
# (`os/arch` or `os/arch/variant`, as `docker image inspect` gives it) serves
# the platform WANTED. Equal values match, and so do values that differ only
# in that one side names no variant: `linux/arm64` and `linux/arm64/v8`.
# Different variants (`linux/arm/v6`, `linux/arm/v7`) and an empty CACHED (no
# image) do not.
platform_matches() {
  local cached="$1" wanted="$2"
  [[ -n "$cached" ]] || return 1
  [[ "$cached" == "$wanted" || "$cached" == "${wanted%/v*}" || "${cached%/v*}" == "$wanted" ]]
}
