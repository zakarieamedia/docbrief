import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { summarizeDocument, estimateAnalysis } from './lib/claude'
import Auth from './components/Auth'
import Sidebar from './components/Sidebar'
import Uploader from './components/Uploader'
import SummaryControls from './components/SummaryControls'
import ConfirmModal from './components/ConfirmModal'
import ResultView, { toStructuredSummary } from './components/ResultView'
import History from './components/History'
import Admin from './pages/Admin'

// The last summary result — including file name and analysis metadata —
// survives refreshes and tab navigation. Cleared on logout.
const STORAGE_KEY = 'docbrief:lastResult'

// Sidebar section tabs for an open document, in display order. Which ones a
// document actually gets depends on its shape — see `tabs` below. No tab is
// ever shown without real content behind it.
const DOC_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'summary', label: 'Full Summary' },
  { id: 'risks', label: 'Risks & Flags' },
  { id: 'parties', label: 'Parties & Financials' },
  { id: 'obligations', label: 'Obligations & Dates' },
  { id: 'chat', label: 'Ask a Question' },
]

function loadStoredResult() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const [doc, setDoc] = useState(null) // { name, size, type, text, wordCount, pages }
  const [progress, setProgress] = useState(null) // { current, total, percent, stage }
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(loadStoredResult) // { summary, wordCount, chunksProcessed, depth, format, focus, fileName, fileType }
  const [historyVersion, setHistoryVersion] = useState(0)
  // Analyze settings awaiting user confirmation in the modal; null = no modal.
  const [pendingAnalysis, setPendingAnalysis] = useState(null) // { depth, format, focus }

  // What the main area shows: { view: 'new' } | { view: 'history' } |
  // { view: 'doc', tab: <DOC_TABS id> }. A rehydrated result opens on its
  // Overview; otherwise start at the upload zone.
  const [nav, setNav] = useState(() =>
    loadStoredResult() ? { view: 'doc', tab: 'overview' } : { view: 'new' },
  )

  // Reset everything tied to the signed-in user — covers every sign-out
  // path (button, expiry, another tab) so the next user on this browser
  // sees none of the previous user's document, summary, or pending modal.
  const clearUserState = () => {
    localStorage.removeItem(STORAGE_KEY)
    setResult(null)
    setDoc(null)
    setError('')
    setProgress(null)
    setPendingAnalysis(null)
    setNav({ view: 'new' })
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) clearUserState()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    try {
      if (result) localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage full or unavailable — persistence is best-effort
    }
  }, [result])

  const isAdmin =
    Boolean(session) && session.user.email === import.meta.env.VITE_ADMIN_EMAIL

  // API calls start only after the user confirms in the modal.
  const handleAnalyzeRequest = (settings) => {
    if (!doc || processing) return
    setPendingAnalysis(settings)
  }

  const runAnalysis = async ({ depth, format, focus }) => {
    if (!doc || processing) return
    setProcessing(true)
    setError('')
    setResult(null)
    try {
      const { summary, chunksProcessed, usage } = await summarizeDocument(
        doc.text,
        { depth, format, focus },
        setProgress,
      )
      setResult({
        id: crypto.randomUUID?.() ?? String(Math.random()),
        summary,
        wordCount: doc.wordCount,
        chunksProcessed,
        actualCost: usage?.actualCost ?? null,
        depth,
        format,
        focus,
        fileName: doc.name,
        fileType: doc.type,
      })
      setNav({ view: 'doc', tab: 'overview' })
    } catch (err) {
      setError(err.message || 'Summarization failed.')
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  const handleConfirmAnalysis = () => {
    const settings = pendingAnalysis
    setPendingAnalysis(null)
    runAnalysis(settings)
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Auth />

  // Which sidebar tabs the open document gets. Structured summaries get the
  // section tabs (Full Summary only once a narrative exists for it); legacy
  // plain-text summaries are all prose, so they get Full Summary + Ask.
  const summaryObj = result ? toStructuredSummary(result.summary) : null
  const docTitle = result ? summaryObj?.documentTitle || result.fileName || 'Document' : null
  const tabs = !result
    ? []
    : summaryObj
      ? DOC_TABS.filter((t) => t.id !== 'summary' || Boolean(summaryObj.fullSummary))
      : DOC_TABS.filter((t) => t.id === 'summary' || t.id === 'chat')

  // Never render a doc view without a document, or a tab the document
  // doesn't have (e.g. a legacy row opened while a section tab was active).
  const view = nav.view === 'doc' && !result ? 'new' : nav.view
  const activeTab =
    view === 'doc' ? (tabs.some((t) => t.id === nav.tab) ? nav.tab : tabs[0]?.id) : null

  const home = (
    <main className="min-h-full px-6 py-8 sm:px-10">
      {view === 'new' && (
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Uploader doc={doc} onExtracted={setDoc} disabled={processing} />
          <SummaryControls
            fileLoaded={Boolean(doc)}
            processing={processing}
            onAnalyze={handleAnalyzeRequest}
          />

          {processing && progress && (
            <div className="bg-surface rounded-xl border border-hair shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-ink">{progress.stage}</span>
                <span className="text-sm text-faint">{progress.percent}%</span>
              </div>
              <div className="h-2 bg-navy/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all duration-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-faint">
                Chunk {progress.current} of {progress.total}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-risk-high/[0.08] border border-risk-high/25 text-risk-high-ink text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}
        </div>
      )}

      {view === 'history' && (
        <div className="mx-auto w-full max-w-3xl">
          <History
            session={session}
            version={historyVersion}
            onSelect={(row) => {
              setResult({
                id: row.id,
                summary: row.summary_text,
                wordCount: row.word_count,
                chunksProcessed: row.chunks_processed,
                actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
                depth: row.depth,
                format: row.format,
                focus: row.focus,
                fileName: row.file_name,
                fileType: row.file_type,
                saved: true,
              })
              setError('')
              setNav({ view: 'doc', tab: 'overview' })
            }}
            onDelete={(id) => {
              // The deleted row may be the summary currently open —
              // clearing result also removes it from localStorage.
              setResult((prev) => (prev && prev.id === id ? null : prev))
            }}
          />
        </div>
      )}

      {view === 'doc' && result && (
        <div className="mx-auto w-full max-w-4xl">
          <ResultView
            // Remount per result so internal state (e.g. `saved`, the chat
            // conversation) resets when a different document opens.
            key={result.id ?? 'rehydrated'}
            result={result}
            session={session}
            onSaved={() => setHistoryVersion((v) => v + 1)}
            activeTab={activeTab}
            documentText={doc?.text}
            documentPages={doc?.pages}
          />
        </div>
      )}
    </main>
  )

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          session={session}
          isAdmin={isAdmin}
          docTitle={docTitle}
          tabs={tabs}
          nav={nav}
          onNavigate={setNav}
          onLogout={() => {
            clearUserState()
            supabase.auth.signOut()
          }}
        />

        <div className="min-w-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={home} />
            <Route
              path="/admin"
              element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {pendingAnalysis && doc && (
        <ConfirmModal
          doc={doc}
          estimate={estimateAnalysis(doc.text)}
          onConfirm={handleConfirmAnalysis}
          onCancel={() => setPendingAnalysis(null)}
        />
      )}
    </BrowserRouter>
  )
}
