import { useEffect, useRef, useState } from 'react'

import { StealthGuardClient } from './client'
import type { Decision, StealthGuardOptions } from './types'

/**
 * React adapter for StealthGuardClient. Creates the client on mount, tracks
 * the latest decision, and exposes flush / challenge helpers.
 */
export function useStealthGuard(options: StealthGuardOptions): {
  sessionId: string | null
  decision: Decision | null
  ready: boolean
  flush: () => Promise<Decision | null>
  respondChallenge: (response: string) => Promise<Decision | null>
} {
  const clientRef = useRef<StealthGuardClient | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const client = new StealthGuardClient(options)
    clientRef.current = client
    const onDecision = (d: Decision): void => {
      setDecision(d)
      setSessionId(client.sessionId)
      setReady(true)
    }
    client.on(onDecision)
    void client.init().then(() => {
      setSessionId(client.sessionId)
      setReady(true)
    })
    return () => {
      client.off(onDecision)
      client.destroy()
      clientRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flush = (): Promise<Decision | null> => clientRef.current?.flush() ?? Promise.resolve(null)
  const respondChallenge = (response: string): Promise<Decision | null> =>
    clientRef.current?.respondChallenge(response) ?? Promise.resolve(null)

  return { sessionId, decision, ready, flush, respondChallenge }
}
