/** Run `fn` with process stdout and stderr captured. */
export async function captureOutput(
  fn: () => Promise<number>,
): Promise<{ code: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const stdout = process.stdout.write.bind(process.stdout)
  const stderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((s: string) => {
    out += s
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((s: string) => {
    err += s
    return true
  }) as typeof process.stderr.write
  try {
    return { code: await fn(), out, err }
  } finally {
    process.stdout.write = stdout
    process.stderr.write = stderr
  }
}
