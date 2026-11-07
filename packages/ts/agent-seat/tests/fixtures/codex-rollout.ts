/** A rollout file name stamped with `ms` in local time, as codex names one. */
export function rolloutFileName(ms: number, id: string): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const time = `${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  return `rollout-${date}T${time}-${id}.jsonl`
}
