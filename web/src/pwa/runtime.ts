import { isDemoMode } from '../api/demo'

export type PwaIdentity = 'public' | 'admin'

const LANGUAGE_STORAGE_KEY = 'tavily-hikari-language'
const THEME_STORAGE_KEY = 'tavily-hikari-theme-mode'

export interface OfflineStateSnapshot {
  isOffline: boolean
}

let currentOfflineState: OfflineStateSnapshot = {
  isOffline: typeof navigator !== 'undefined' ? navigator.onLine === false : false,
}

const offlineListeners = new Set<(snapshot: OfflineStateSnapshot) => void>()

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function readOfflineState(): OfflineStateSnapshot {
  return {
    isOffline: typeof navigator !== 'undefined' ? navigator.onLine === false : false,
  }
}

function publishOfflineState(): void {
  currentOfflineState = readOfflineState()
  for (const listener of offlineListeners) {
    listener(currentOfflineState)
  }
}

if (canUseDom()) {
  window.addEventListener('online', publishOfflineState)
  window.addEventListener('offline', publishOfflineState)
}

function shouldRegisterServiceWorker(): boolean {
  if (!canUseDom()) return false
  const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
  if (env?.DEV) return false
  if (isDemoMode()) return false
  return 'serviceWorker' in navigator
}

function swPath(identity: PwaIdentity): string {
  return identity === 'admin' ? '/sw-admin.js' : '/sw-public.js'
}

function swScope(identity: PwaIdentity): string {
  return identity === 'admin' ? '/admin/' : '/'
}

export function normalizeAdminShellPath(): void {
  if (!canUseDom()) return
  if (window.location.pathname === '/admin') {
    window.history.replaceState(null, '', `/admin/${window.location.search}${window.location.hash}`)
  }
}

export async function registerPwaServiceWorker(identity: PwaIdentity): Promise<void> {
  if (!shouldRegisterServiceWorker()) return

  const pathname = window.location.pathname
  if (identity === 'admin') {
    if (!(pathname === '/admin/' || pathname.startsWith('/admin/'))) return
  } else if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return
  }

  await navigator.serviceWorker.register(swPath(identity), { scope: swScope(identity) })
}

export function subscribeOfflineState(listener: (snapshot: OfflineStateSnapshot) => void): () => void {
  offlineListeners.add(listener)
  listener(currentOfflineState)
  return () => {
    offlineListeners.delete(listener)
  }
}

export function getOfflineStateSnapshot(): OfflineStateSnapshot {
  return currentOfflineState
}

export function bootstrapOfflineShellDocument(): void {
  if (!canUseDom()) return
  try {
    const language = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (language === 'en' || language === 'zh') {
      document.documentElement.lang = language
    }
  } catch {
    // ignore storage failures
  }
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
      return
    }
    if (theme === 'light') {
      document.documentElement.classList.remove('dark')
      document.documentElement.style.colorScheme = 'light'
      return
    }
  } catch {
    // ignore storage failures
  }
}
