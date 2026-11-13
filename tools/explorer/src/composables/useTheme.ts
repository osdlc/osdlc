import { ref, watchEffect } from 'vue'
import { applyTheme, loadTheme, nextTheme, saveTheme } from '../model/theme'

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function useTheme() {
  const theme = ref(loadTheme(storage()))
  watchEffect(() => applyTheme(document.documentElement, theme.value))
  function cycle() {
    theme.value = nextTheme(theme.value)
    saveTheme(storage(), theme.value)
  }
  return { theme, cycle }
}
