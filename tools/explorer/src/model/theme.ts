export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_ORDER: readonly ThemeChoice[] = ['system', 'light', 'dark']
export const THEME_LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' }
export const THEME_KEY = 'explorer-theme'

/** The choice after this one when the toggle is pressed. */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length]!
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_ORDER as readonly string[]).includes(value)
}

/** The saved choice, or 'system' when nothing valid is saved or storage is unavailable. */
export function loadTheme(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const value = storage?.getItem(THEME_KEY)
    return isThemeChoice(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Saving is best effort: private windows and blocked storage throw. */
export function saveTheme(storage: Pick<Storage, 'setItem'> | undefined, choice: ThemeChoice): void {
  try {
    storage?.setItem(THEME_KEY, choice)
  } catch {
    // The choice still applies for this page view.
  }
}

/** 'system' removes data-theme so the prefers-color-scheme rules apply. */
export function applyTheme(root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>, choice: ThemeChoice): void {
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}
