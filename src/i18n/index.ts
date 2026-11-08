/**
 * Sistema de Internacionalização (i18n) Reativo do NexoMD.
 *
 * Corrige a falha estrutural F-01 do MarkText v0.17.1:
 * No MarkText, `general.vue` tinha o seletor de idiomas travado com `disable: !0`
 * e 100% da aplicação em inglês hardcoded.
 *
 * O NexoMD fornece suporte nativo e troca em tempo real (`pt-BR` por padrão + `en`),
 * sem necessidade de reiniciar o aplicativo.
 */

import { ref, computed } from 'vue'
import ptBR from './locales/pt-BR.json'
import en from './locales/en.json'

export type SupportedLocale = 'pt-BR' | 'en'

const dictionaries: Record<SupportedLocale, Record<string, any>> = {
  'pt-BR': ptBR,
  en
}

const savedLocale = (typeof localStorage !== 'undefined' && localStorage.getItem('nexomd.locale')) as SupportedLocale | null
const currentLocale = ref<SupportedLocale>(savedLocale && dictionaries[savedLocale] ? savedLocale : 'pt-BR')

export function setLocale(locale: SupportedLocale): void {
  if (dictionaries[locale]) {
    currentLocale.value = locale
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('nexomd.locale', locale)
    }
  }
}

export function t(keyPath: string): string {
  const parts = keyPath.split('.')
  let current: any = dictionaries[currentLocale.value]
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part]
    } else {
      current = null
      break
    }
  }
  if (typeof current === 'string') {
    return current
  }

  // Fallback para inglês caso alguma chave esteja ausente
  let fallback: any = dictionaries.en
  for (const part of parts) {
    if (fallback && typeof fallback === 'object' && part in fallback) {
      fallback = fallback[part]
    } else {
      return keyPath
    }
  }
  return typeof fallback === 'string' ? fallback : keyPath
}

export function useI18n() {
  return {
    locale: computed({
      get: () => currentLocale.value,
      set: (val: SupportedLocale) => setLocale(val)
    }),
    t,
    setLocale,
    availableLocales: [
      { code: 'pt-BR' as SupportedLocale, label: 'Português (Brasil)' },
      { code: 'en' as SupportedLocale, label: 'English (US)' }
    ]
  }
}
