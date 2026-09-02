import { useEffect, useState } from 'react'
import { Button } from '@stealthguard/ui'

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
import { TelemetryCharts } from './components/TelemetryCharts'

type View = 'overview' | 'sessions'

export default function App() {
  const [view, setView] = useState<View>('overview')
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
    <div className="admin-layout">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="sidebar-brand">
          <h1>STEALTHGUARD_OS</h1>
        </div>
        <div className="sidebar-profile">
          <div className="sidebar-avatar">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="sidebar-user">
            <div className="name">OPERATOR_01</div>
            <div className="role">Authenticated Session</div>
          </div>
        </div>
        <div className="sidebar-nav">
          <Button
            type="button"
            variant="ghost"
            className={`sidebar-link ${view === 'overview' ? 'active' : ''}`}
            onClick={() => setView('overview')}
          >
            <span
              className="material-symbols-outlined"
              style={view === 'overview' ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              dashboard
            </span>
            <span>Overview</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`sidebar-link ${view === 'sessions' ? 'active' : ''}`}
            onClick={() => setView('sessions')}
          >
            <span
              className="material-symbols-outlined"
              style={view === 'sessions' ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              group
            </span>
            <span>Sessions</span>
          </Button>
        </div>
        <div className="sidebar-footer">
          <Button type="button" className="sidebar-action" disabled>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              play_arrow
            </span>
            INITIATE SCAN
          </Button>
        </div>
      </nav>

      <div className="admin-main">
        <header className="top-nav">
          <span className="top-nav-brand">STEALTHGUARD_OS</span>
          <nav className="top-nav-links">
            <a className="top-nav-link" href="http://localhost:5173">
              DEMO
            </a>
            <span className="top-nav-link active">ADMIN</span>
            <a className="top-nav-link" href="http://localhost:5175">
              SANDBOX
            </a>
          </nav>
          <div className="top-nav-actions">
            <span className="material-symbols-outlined">terminal</span>
            <span className="material-symbols-outlined">settings</span>
            <span className="material-symbols-outlined">account_circle</span>
          </div>
        </header>

        <div className="dashboard-content">
          {view === 'overview' && (
            <>
              <StatsCharts stats={stats} />
              <TelemetryCharts sessions={sessions} />
              <SessionTable
                sessions={sessions.slice(0, 2)}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id)
                  setView('sessions')
                }}
              />
            </>
          )}
          {view === 'sessions' && (
            <>
              <SessionTable sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
              <SessionDetailPanel
                detail={detail}
                feedbackStatus={feedbackStatus}
                onFeedback={onFeedback}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
