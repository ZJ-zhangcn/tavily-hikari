import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import {
  fetchForwardProxyKeyAffinity,
  rebalanceForwardProxyKeyAffinity,
  type ForwardProxyAssignmentCount,
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

function summarizeLoad(counts: ForwardProxyAssignmentCount[]) {
  const primaryLoads = counts.map((row) => row.primary).filter((n) => n > 0)
  const maxPrimary = primaryLoads.length ? Math.max(...primaryLoads) : 0
  const usedNodes = primaryLoads.length
  const sumPrimary = primaryLoads.reduce((acc, n) => acc + n, 0)
  const top = [...counts].sort((a, b) => b.primary - a.primary || b.secondary - a.secondary).slice(0, 12)
  return { maxPrimary, usedNodes, sumPrimary, top }
}

/** Soft threshold: if one host carries more than this many primaries, show congestion. */
const CONGESTED_PRIMARY = 5

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

  const summary = useMemo(
    () => summarizeLoad(data?.assignmentCounts ?? []),
    [data?.assignmentCounts],
  )
  const lockedCount = data?.items.filter((item) => item.locked).length ?? 0
  const bindingCount = data?.items.length ?? 0
  const congested = summary.maxPrimary >= CONGESTED_PRIMARY

  const onRebalance = async () => {
    if (rebalancing) return
    const ok = window.confirm(
      congested
        ? `检测到部分出口绑定数偏高（峰值 ${summary.maxPrimary}）。\n将打散未锁定的 Key 绑定，是否继续？`
        : '将把未锁定的 Key 重新均匀分配到各出口。已锁定的不会动。\n是否继续？',
    )
    if (!ok) return

    setRebalancing(true)
    setError(null)
    setMessage(null)
    const beforeMax = summary.maxPrimary
    try {
      const result = await rebalanceForwardProxyKeyAffinity(true)
      const next = await fetchForwardProxyKeyAffinity()
      setData(next)
      const after = summarizeLoad(next.assignmentCounts ?? [])
      setMessage(
        `已打散 ${result.updated} 条未锁定绑定：峰值 ${beforeMax} → ${after.maxPrimary}（使用 ${after.usedNodes} 个出口）`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRebalancing(false)
    }
  }

  return (
    <Card className="surface panel">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>Key 出口绑定</CardTitle>
          <CardDescription>
            每个 Key 优先固定一条出口，避免全部挤在同一代理。日常一般不用管；若发现 429
            集中爆发，再点「一键打散」。
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading || rebalancing}>
            刷新
          </Button>
          <Button size="sm" onClick={() => void onRebalance()} disabled={loading || rebalancing || bindingCount === 0}>
            {rebalancing ? '打散中…' : '一键打散'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">绑定 {bindingCount}</Badge>
          <Badge variant="secondary">已锁定 {lockedCount}</Badge>
          <Badge variant="secondary">使用出口 {summary.usedNodes}</Badge>
          <Badge variant={congested ? 'destructive' : 'secondary'}>峰值 {summary.maxPrimary}</Badge>
        </div>

        {congested ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            出口偏挤：单个节点绑了 {summary.maxPrimary} 个 Key。建议点「一键打散」，降低集中 429 风险。
          </div>
        ) : bindingCount > 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            分布正常：峰值 {summary.maxPrimary}，已分散到 {summary.usedNodes} 个出口。
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-foreground">{message}</p> : null}

        {loading && !data ? (
          <p className="text-sm text-muted-foreground">加载绑定中…</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>出口主机</TableHead>
                <TableHead className="text-right">主绑定</TableHead>
                <TableHead className="text-right">备用</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.top.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    暂无绑定。Key 首次请求时会自动分配出口。
                  </TableCell>
                </TableRow>
              ) : (
                summary.top.map((row) => (
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
