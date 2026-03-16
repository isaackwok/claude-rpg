import { createContext, useContext, useState, useCallback, createElement, type ReactNode } from 'react'
import type { Locale } from './types'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'

export type { Locale, LocalizedString } from './types'

const locales: Record<Locale, Record<string, unknown>> = { 'zh-TW': zhTW, en }

let currentLocale: Locale = detectLocale()

function detectLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language
    if (lang.startsWith('zh')) return 'zh-TW'
  }
  return 'zh-TW'
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

/** Translate a dot-notated key. Falls back to zh-TW, then returns the key itself. */
export function t(key: string): string {
  return (
    getNestedValue(locales[currentLocale], key) ??
    getNestedValue(locales['zh-TW'], key) ??
    key
  )
}

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

// --- React integration ---

interface I18nContextValue {
  locale: Locale
  t: (key: string) => string
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue>({
  locale: currentLocale,
  t,
  setLocale
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(currentLocale)

  const handleSetLocale = useCallback((newLocale: Locale) => {
    setLocale(newLocale)
    setLocaleState(newLocale)
  }, [])

  const translate = useCallback(
    (key: string) => {
      // Re-read from locales using the current locale state to trigger re-renders
      return (
        getNestedValue(locales[locale], key) ??
        getNestedValue(locales['zh-TW'], key) ??
        key
      )
    },
    [locale]
  )

  return createElement(
    I18nContext.Provider,
    { value: { locale, t: translate, setLocale: handleSetLocale } },
    children
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}
