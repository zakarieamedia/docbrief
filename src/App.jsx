import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { summarizeDocument, estimateAnalysis } from './lib/claude'
import Auth from './components/Auth'
import Uploader from './components/Uploader'
import SummaryControls from './components/SummaryControls'
import ConfirmModal from './components/ConfirmModal'
import ResultView from './components/ResultView'
import History from './components/History'
import Admin from './pages/Admin'

// The last summary result — including file name and analysis metadata —
// survives refreshes and tab navigation. Cleared on logout.
const STORAGE_KEY = 'docbrief:lastResult'

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

  const [doc, setDoc] = useState(null) // { name, size, type, text, wordCount }
  const [progress, setProgress] = useState(null) // { current, total, percent, stage }
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(loadStoredResult) // { summary, wordCount, chunksProcessed, depth, format, focus, fileName, fileType }
  const [historyVersion, setHistoryVersion] = useState(0)
  // Analyze settings awaiting user confirmation in the modal; null = no modal.
  const [pendingAnalysis, setPendingAnalysis] = useState(null) // { depth, format, focus }

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

  const home = (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside className="order-2 lg:order-1">
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
          }}
          onDelete={(id) => {
            // The deleted row may be the summary currently on screen —
            // clearing result also removes it from localStorage.
            setResult((prev) => (prev && prev.id === id ? null : prev))
          }}
        />
      </aside>

      <section className="order-1 lg:order-2 space-y-6">
        <Uploader doc={doc} onExtracted={setDoc} disabled={processing} />
        <SummaryControls
          fileLoaded={Boolean(doc)}
          processing={processing}
          onAnalyze={handleAnalyzeRequest}
        />

        {processing && progress && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{progress.stage}</span>
              <span className="text-sm text-gray-500">{progress.percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-navy rounded-full transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Chunk {progress.current} of {progress.total}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {result && (
          <ResultView
            // Remount per result so internal state (e.g. `saved`) resets when
            // a history row replaces a fresh analysis on screen.
            key={result.id ?? 'rehydrated'}
            result={result}
            session={session}
            onSaved={() => setHistoryVersion((v) => v + 1)}
          />
        )}
      </section>
    </main>
  )

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* Navbar */}
        <header className="bg-navy text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center">
                <span className="font-bold">D</span>
              </div>
              <span className="text-xl font-bold tracking-tight">DocBrief</span>
            </Link>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Admin
                </Link>
              )}
              <span className="hidden sm:block text-sm text-white/80">{session.user.email}</span>
              <button
                onClick={() => {
                  clearUserState()
                  supabase.auth.signOut()
                }}
                className="text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={home} />
          <Route
            path="/admin"
            element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {pendingAnalysis && doc && (
          <ConfirmModal
            doc={doc}
            estimate={estimateAnalysis(doc.text)}
            onConfirm={handleConfirmAnalysis}
            onCancel={() => setPendingAnalysis(null)}
          />
        )}
      </div>
    </BrowserRouter>
  )
}
