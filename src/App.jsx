import { useEffect, useRef, useState } from 'react'
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

  // The document text backing the OPEN result's Q&A, keyed by result id so a
  // summary is only ever grounded in its own document (never in whatever was
  // last uploaded). Fresh analyses set it directly; history rows fetch it
  // from the private Storage bucket. status: 'ready' | 'loading' | 'missing'.
  const [docText, setDocText] = useState(null) // { resultId, status, text?, pages? }
  const docFetchSeq = useRef(0)

  const loadStoredDocument = async (resultId, path) => {
    const seq = ++docFetchSeq.current
    setDocText({ resultId, status: 'loading' })
    try {
      const { data, error } = await supabase.storage.from('documents').download(path)
      if (error) throw error
      const parsed = JSON.parse(await data.text())
      if (docFetchSeq.current !== seq) return // a newer result took over
      setDocText({
        resultId,
        status: 'ready',
        text: parsed.text,
        pages: parsed.pages ?? null,
      })
    } catch (err) {
      console.error('Could not load the stored document text:', err)
      if (docFetchSeq.current !== seq) return
      setDocText({ resultId, status: 'missing' })
    }
  }

  // Reset everything tied to the signed-in user — covers every sign-out
  // path (button, expiry, another tab) so the next user on this browser
  // sees none of the previous user's document, summary, or pending modal.
  const clearUserState = () => {
    localStorage.removeItem(STORAGE_KEY)
    setResult(null)
    setDoc(null)
    setDocText(null)
    docFetchSeq.current++ // invalidate any in-flight storage fetch
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

  // A result rehydrated after a refresh has no in-memory document text. If it
  // was saved with a stored document, fetch that; otherwise the Q&A tab shows
  // the honest re-upload fallback.
  useEffect(() => {
    const r = loadStoredResult()
    if (r?.document_path) loadStoredDocument(r.id ?? 'rehydrated', r.document_path)
    else if (r) setDocText({ resultId: r.id ?? 'rehydrated', status: 'missing' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const id = crypto.randomUUID?.() ?? String(Math.random())
      setResult({
        id,
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
      // Bind this analysis's text to this result — Q&A grounds only in it.
      docFetchSeq.current++
      setDocText({ resultId: id, status: 'ready', text: doc.text, pages: doc.pages ?? null })
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
  // section tabs; legacy plain-text summaries are all prose, so they get
  // Full Summary + Ask. Section tabs only appear when they have real content
  // — with one deliberate exception: Risks & Flags ALWAYS shows, even empty,
  // because a hidden risks tab would silently imply "this document is safe"
  // when it actually means "nothing was flagged."
  const summaryObj = result ? toStructuredSummary(result.summary) : null
  const docTitle = result ? summaryObj?.documentTitle || result.fileName || 'Document' : null
  const tabs = !result
    ? []
    : summaryObj
      ? DOC_TABS.filter((t) => {
          if (t.id === 'summary') return Boolean(summaryObj.fullSummary)
          if (t.id === 'parties')
            return summaryObj.parties.length > 0 || summaryObj.financialTerms.length > 0
          if (t.id === 'obligations')
            return (
              summaryObj.keyObligations.length > 0 || summaryObj.importantDates.length > 0
            )
          return true // overview, risks, chat always
        })
      : DOC_TABS.filter((t) => t.id === 'summary' || t.id === 'chat')

  // Never render a doc view without a document, or a tab the document
  // doesn't have (e.g. a legacy row opened while a section tab was active).
  const view = nav.view === 'doc' && !result ? 'new' : nav.view
  const activeTab =
    view === 'doc' ? (tabs.some((t) => t.id === nav.tab) ? nav.tab : tabs[0]?.id) : null

  // The chat tab fills the viewport height (composer pinned at the bottom,
  // conversation scrolling internally) instead of scrolling the page.
  const chatActive = view === 'doc' && activeTab === 'chat'

  // Only hand the chat text that belongs to THIS result.
  const activeDocText =
    docText && result && docText.resultId === (result.id ?? 'rehydrated') ? docText : null

  const home = (
    <main className={chatActive ? 'h-full px-6 sm:px-10' : 'min-h-full px-6 py-8 sm:px-10'}>
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
                document_path: row.document_path ?? null,
                saved: true,
              })
              setError('')
              // Rows saved with a stored document get their text back for
              // Q&A; older rows show the honest re-upload fallback.
              if (row.document_path) loadStoredDocument(row.id, row.document_path)
              else {
                docFetchSeq.current++
                setDocText({ resultId: row.id, status: 'missing' })
              }
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
        <div className={`mx-auto w-full max-w-4xl ${chatActive ? 'h-full' : ''}`}>
          <ResultView
            // Remount per result so internal state (e.g. `saved`, the chat
            // conversation) resets when a different document opens.
            key={result.id ?? 'rehydrated'}
            result={result}
            session={session}
            onSaved={(documentPath) => {
              setHistoryVersion((v) => v + 1)
              // Remember where the text lives so a refresh can restore Q&A.
              if (documentPath)
                setResult((prev) => (prev ? { ...prev, document_path: documentPath } : prev))
            }}
            activeTab={activeTab}
            documentText={activeDocText?.status === 'ready' ? activeDocText.text : undefined}
            documentPages={
              activeDocText?.status === 'ready' ? (activeDocText.pages ?? undefined) : undefined
            }
            documentTextStatus={activeDocText?.status ?? 'missing'}
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

        <div className={`min-w-0 flex-1 ${chatActive ? 'overflow-hidden' : 'overflow-y-auto'}`}>
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
