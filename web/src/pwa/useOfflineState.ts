import { useEffect, useState } from 'react'

import { getOfflineStateSnapshot, subscribeOfflineState, type OfflineStateSnapshot } from './runtime'

export function useOfflineState(): OfflineStateSnapshot {
  const [snapshot, setSnapshot] = useState<OfflineStateSnapshot>(() => getOfflineStateSnapshot())

  useEffect(() => subscribeOfflineState(setSnapshot), [])

  return snapshot
}
