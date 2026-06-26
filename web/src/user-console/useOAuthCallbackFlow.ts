import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { finalizeLinuxDoAuth } from '../api'
import { userConsoleRouteToPath, type UserConsoleRoute } from '../lib/userConsoleRoutes'
import {
  OAUTH_CALLBACK_FINALIZE_TIMEOUT_MS,
  USER_CONSOLE_LOGIN_START_PATH,
  parseOAuthCallbackQuery,
  resolveOAuthCallbackPanelModel,
  resolveOAuthCallbackProviderLabel,
  type OAuthCallbackScreenState,
} from './oauthCallback'
import type { EN } from './text'

interface UseOAuthCallbackFlowArgs {
  route: UserConsoleRoute
  providers: typeof EN.header.providers
  text: typeof EN.oauthCallback
  abortActiveConsoleLoads: () => void
  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useOAuthCallbackFlow({
  route,
  providers,
  text,
  abortActiveConsoleLoads,
  setLoading,
  setError,
}: UseOAuthCallbackFlowArgs) {
  const isOAuthCallbackRoute = route.name === 'oauthCallback'
  const [oauthCallbackState, setOauthCallbackState] = useState<OAuthCallbackScreenState>('connecting')
  const [oauthCallbackDetail, setOauthCallbackDetail] = useState<string | null>(null)
  const oauthCallbackQueryRef = useRef<ReturnType<typeof parseOAuthCallbackQuery> | null>(null)
  const oauthCallbackRedirectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOAuthCallbackRoute) {
      oauthCallbackQueryRef.current = null
      if (oauthCallbackRedirectTimerRef.current != null) {
        window.clearTimeout(oauthCallbackRedirectTimerRef.current)
        oauthCallbackRedirectTimerRef.current = null
      }
      return
    }
    oauthCallbackQueryRef.current = parseOAuthCallbackQuery(window.location.search)
    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, '', userConsoleRouteToPath(route))
    }
  }, [isOAuthCallbackRoute, route])

  useEffect(() => {
    if (!isOAuthCallbackRoute || route.name !== 'oauthCallback') return

    abortActiveConsoleLoads()
    setLoading(false)
    setError(null)

    if (route.provider !== 'linuxdo') {
      setOauthCallbackState('unsupportedProvider')
      setOauthCallbackDetail(null)
      return
    }

    const query = oauthCallbackQueryRef.current ?? parseOAuthCallbackQuery(window.location.search)
    if (query.error) {
      setOauthCallbackState('providerDenied')
      setOauthCallbackDetail(query.errorDescription ?? query.error)
      return
    }
    if (!query.code || !query.state) {
      setOauthCallbackState('invalidRequest')
      setOauthCallbackDetail(null)
      return
    }

    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, OAUTH_CALLBACK_FINALIZE_TIMEOUT_MS)

    setOauthCallbackState('connecting')
    setOauthCallbackDetail(null)

    void finalizeLinuxDoAuth(query.code, query.state, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.outcome === 'success') {
          setOauthCallbackState('success')
          setOauthCallbackDetail(null)
          oauthCallbackRedirectTimerRef.current = window.setTimeout(() => {
            window.location.href = result.redirectTo || '/console'
          }, 720)
          return
        }
        if (result.outcome === 'registration_paused') {
          window.location.href = result.redirectTo || '/registration-paused'
          return
        }
        if (result.outcome === 'invalid_state') {
          setOauthCallbackState('invalidState')
          setOauthCallbackDetail(result.detail)
          return
        }
        if (result.outcome === 'inactive_user') {
          setOauthCallbackState('inactiveUser')
          setOauthCallbackDetail(result.detail)
          return
        }
        if (result.outcome === 'upstream_failure') {
          setOauthCallbackState('upstreamFailure')
          setOauthCallbackDetail(result.detail)
          return
        }
        setOauthCallbackState('serverError')
        setOauthCallbackDetail(result.detail)
      })
      .catch((err) => {
        if (timedOut) {
          setOauthCallbackState('timeout')
          setOauthCallbackDetail(null)
          return
        }
        if (controller.signal.aborted) return
        setOauthCallbackState('serverError')
        setOauthCallbackDetail(err instanceof Error ? err.message : null)
      })
      .finally(() => {
        window.clearTimeout(timeout)
      })

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [abortActiveConsoleLoads, isOAuthCallbackRoute, route, setError, setLoading])

  const providerLabel = route.name === 'oauthCallback'
    ? resolveOAuthCallbackProviderLabel(route.provider, providers)
    : providers.linuxdo
  const model = useMemo(
    () => resolveOAuthCallbackPanelModel({
      state: oauthCallbackState,
      providerLabel,
      text,
      detail: oauthCallbackDetail,
    }),
    [oauthCallbackDetail, oauthCallbackState, providerLabel, text],
  )
  const restartAuth = useCallback(() => {
    window.location.href = USER_CONSOLE_LOGIN_START_PATH
  }, [])

  return {
    isOAuthCallbackRoute,
    model,
    restartAuth,
  }
}
