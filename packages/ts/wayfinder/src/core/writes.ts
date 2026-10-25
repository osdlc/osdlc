/**
 * The writes this process starts without waiting: the saved view and the
 * probe store. A surface answers first and writes after. `process.exit`
 * would drop a write in flight, so every way out awaits {@link flushWrites}.
 */

const pending = new Set<Promise<unknown>>()

/** Keep `write` until it settles, so {@link flushWrites} waits for it. Returns `write`. */
export function trackWrite<T>(write: Promise<T>): Promise<T> {
  const settled = write.then(
    () => {},
    () => {},
  )
  pending.add(settled)
  void settled.finally(() => pending.delete(settled))
  return write
}

/**
 * Settles when every write this process started has ended, those started
 * while it waits included. Call it before `process.exit`, and before a test
 * removes the cache directory.
 */
export async function flushWrites(): Promise<void> {
  while (pending.size > 0) await Promise.all(pending)
}
