import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchForwardProxyKeyAffinity,
  rebalanceForwardProxyKeyAffinity,
  type ForwardProxyKeyAffinityListResponse,
} from '../api'

function hostFromProxyKey(proxyKey: string): string {
  try {
    const url = new URL(proxyKey.includes('://') ? proxyKey : `http://${proxyKey}`)
    return url.hostname || proxyKey
  } catch {
    return proxyKey
  }
}

export default function ForwardProxyKeyAffinityPanel(): JSX.Element {
  const [data, setData] = useState<ForwardProxyKeyAffinityListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [rebalancing, setRebalancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchForwardProxyKeyAffinity()
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onRebalance = async () => {
    setRebalancing(true)
    setError(null)
    setMessage(null)
    try {
      const result = await rebalanceForwardProxyKeyAffinity(true)
      setMessage(`Rebalanced ${result.updated} unlocked bindings`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRebalancing(false)
    }
  }

  const top = (data?.assignmentCounts ?? []).slice(0, 12)
  const lockedCount = data?.items.filter((item) => item.locked).length ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Key ↔ Proxy affinity</CardTitle>
          <CardDescription>
            Primary egress bindings. Rebalance spreads unlocked keys across nodes (load-aware).
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || rebalancing}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => void onRebalance()} disabled={loading || rebalancing}>
            {rebalancing ? 'Rebalancing…' : 'Rebalance unlocked'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">bindings: {data?.items.length ?? 0}</Badge>
          <Badge variant="secondary">locked: {lockedCount}</Badge>
          <Badge variant="secondary">nodes with load: {data?.assignmentCounts.length ?? 0}</Badge>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Loading affinity…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead className="text-right">Primary</TableHead>
                <TableHead className="text-right">Secondary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No affinity rows yet.
                  </TableCell>
                </TableRow>
              ) : (
                top.map((row) => (
                  <TableRow key={row.proxyKey}>
                    <TableCell className="font-mono text-xs">{hostFromProxyKey(row.proxyKey)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.primary}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.secondary}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
