import { useEffect, useState } from 'react'

import {
  fetchSession,
  fetchSessions,
  fetchStats,
  postFeedback,
  type SessionDetail,
  type SessionSummary,
  type Stats,
} from './api'
import { SessionDetail as SessionDetailPanel } from './components/SessionDetail'
import { SessionTable } from './components/SessionTable'
import { StatsCharts } from './components/StatsCharts'

export default function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      void fetchSessions()
        .then((page) => setSessions(page.content))
        .catch(() => setSessions([]))
      void fetchStats()
        .then(setStats)
        .catch(() => setStats(null))
    }
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    void fetchSession(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [selectedId])

  const onFeedback = async (label: string): Promise<void> => {
    if (!selectedId) return
    try {
      await postFeedback(selectedId, 'analyst', label)
      setFeedbackStatus(`Saved: ${label}`)
    } catch {
      setFeedbackStatus('Failed to save feedback')
    }
  }

  return (
    <main>
      <h1>StealthGuard Analyst Dashboard</h1>
      <StatsCharts stats={stats} />
      <SessionTable sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
      <SessionDetailPanel detail={detail} feedbackStatus={feedbackStatus} onFeedback={onFeedback} />
    </main>
  )
}
