import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { summarizeDocument } from './lib/claude'
import Auth from './components/Auth'
import Uploader from './components/Uploader'
import SummaryControls from './components/SummaryControls'
import ResultView from './components/ResultView'
import History from './components/History'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const [doc, setDoc] = useState(null) // { name, size, type, text, wordCount }
  const [progress, setProgress] = useState(null) // { current, total, percent, stage }
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { summary, wordCount, chunksProcessed, depth, format, focus, fileName, fileType }
  const [historyVersion, setHistoryVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const handleAnalyze = async ({ depth, format, focus }) => {
    if (!doc || processing) return
    setProcessing(true)
    setError('')
    setResult(null)
    try {
      const { summary, chunksProcessed } = await summarizeDocument(
        doc.text,
        { depth, format, focus },
        setProgress,
      )
      setResult({
        summary,
        wordCount: doc.wordCount,
        chunksProcessed,
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

  const handleHistorySelect = (row) => {
    setResult({
      summary: row.summary_text,
      wordCount: row.word_count,
      chunksProcessed: null,
      depth: row.depth,
      format: row.format,
      focus: row.focus,
      fileName: row.file_name,
      fileType: row.file_type,
      saved: true,
    })
    setError('')
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Auth />

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="bg-navy text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center">
              <span className="font-bold">D</span>
            </div>
            <span className="text-xl font-bold tracking-tight">DocBrief</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-sm text-white/80">{session.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Two-panel layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <aside className="order-2 lg:order-1">
          <History
            session={session}
            version={historyVersion}
            onSelect={handleHistorySelect}
          />
        </aside>

        <section className="order-1 lg:order-2 space-y-6">
          <Uploader doc={doc} onExtracted={setDoc} disabled={processing} />
          <SummaryControls
            fileLoaded={Boolean(doc)}
            processing={processing}
            onAnalyze={handleAnalyze}
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
              result={result}
              session={session}
              onSaved={() => setHistoryVersion((v) => v + 1)}
            />
          )}
        </section>
      </main>
    </div>
  )
}
