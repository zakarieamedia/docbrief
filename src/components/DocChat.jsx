import { useEffect, useRef, useState } from 'react'
import { askQuestion } from '../lib/claude'
import { humanizeError } from '../lib/messages'
import Markdown from './Markdown'
import PagePointer from './PagePointer'

// Example questions shown in the empty state; clicking one fills the composer.
const SUGGESTIONS = [
  'What are the key deadlines?',
  'What are the biggest risks?',
  'Who are the parties involved?',
]

// The Ask a Question tab: a full-height chat over the open document. Every
// question replays the whole conversation to Claude, grounded in the extracted
// document text, and gets back a conversational answer plus a citation
// pointing into the source. Questions sit right, answers left, each answer
// carries its source tag, and the composer is pinned at the bottom.
// `textStatus`: 'ready' (text present), 'loading' (being fetched from
// Storage for a reopened summary), or 'missing' (legacy row / no stored
// text — the honest fallback asks for a re-upload).
export default function DocChat({
  documentText,
  documentPages,
  textStatus = 'missing',
  userInitial = '?',
}) {
  // Each message is { role, content }. Assistant messages also carry `citation`.
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // A new document invalidates the previous conversation entirely.
  useEffect(() => {
    setMessages([])
    setInput('')
    setError('')
  }, [documentText])

  // Keep the newest message (or the thinking indicator) in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const canSend = Boolean(documentText) && input.trim() && !loading

  const handleSend = async (e) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question || loading || !documentText) return

    // Snapshot the prior turns before appending — askQuestion adds the new
    // question itself, so it must receive history without it.
    const history = messages
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setError('')
    setLoading(true)
    try {
      const { answer, citation } = await askQuestion(
        question,
        documentText,
        history,
        documentPages,
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, citation }])
    } catch (err) {
      setError(humanizeError(err, 'chat'))
    } finally {
      setLoading(false)
    }
  }

  const empty = messages.length === 0 && !loading && !error

  return (
    <div className="flex h-full flex-col">
      {/* Slim header — the tab is already the destination; just the ground rule. */}
      <div className="shrink-0 border-b border-hair pb-4 pt-6">
        <h2 className="font-serif text-lg font-bold text-ink">
          Ask a question about this document
        </h2>
        <p className="mt-0.5 text-xs text-faint">
          Answers come only from the document you uploaded, with a pointer to where to verify.
        </p>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-6">
        {empty ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy">
              <span className="font-serif text-xl font-bold text-white">D</span>
            </div>
            <h3 className="mt-4 font-serif text-xl font-bold text-ink">
              Ask anything about this document
            </h3>
            <p className="mt-1 max-w-sm text-sm text-faint">
              Plain-English answers, straight from the source — never from anywhere else.
            </p>
            {documentText ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setInput(s)
                      inputRef.current?.focus()
                    }}
                    className="rounded-full border border-hair bg-surface px-3.5 py-1.5 text-sm text-ink transition-colors hover:border-navy hover:text-navy"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : textStatus === 'loading' ? (
              <p className="mt-4 flex items-center gap-2 text-sm italic text-faint">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-navy/40 border-t-transparent" />
                Retrieving the document text for this summary…
              </p>
            ) : (
              <p className="mt-4 max-w-sm text-sm italic text-faint">
                This saved summary doesn&rsquo;t include the document text — re-upload the
                document to ask questions about it.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div key={i} className="flex items-start justify-end gap-2.5">
                  <div className="max-w-[75%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-navy px-4 py-2.5 text-sm leading-relaxed text-white">
                    {msg.content}
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-navy/20 bg-navy-pale font-serif text-xs font-bold text-navy">
                    {userInitial}
                  </span>
                </div>
              ) : (
                <div key={i} className="flex items-start justify-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy font-serif text-sm font-bold text-white">
                    D
                  </span>
                  <div className="max-w-[75%] break-words rounded-2xl rounded-tl-sm border border-hair bg-surface px-4 py-3 text-ink">
                    <Markdown className="text-sm leading-relaxed [&_p]:mb-2 [&_:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4">
                      {msg.content}
                    </Markdown>
                    {msg.citation && (
                      <div className="mt-2 flex items-center gap-1.5 border-t border-hair pt-2">
                        <span className="text-[11px] font-medium text-faint">Source:</span>
                        <PagePointer citation={msg.citation} />
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {loading && (
              <div className="flex items-start justify-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy font-serif text-sm font-bold text-white">
                  D
                </span>
                <div className="rounded-2xl rounded-tl-sm border border-hair bg-surface px-4 py-3">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40" />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start pl-[42px]">
                <div className="max-w-[75%] rounded-2xl rounded-tl-sm border border-risk-high/25 bg-risk-high/[0.08] px-4 py-2.5 text-sm text-risk-high-ink">
                  {error}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer pinned at the bottom */}
      <form onSubmit={handleSend} className="flex shrink-0 gap-2.5 border-t border-hair pb-6 pt-4">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            documentText
              ? 'Ask a question…'
              : textStatus === 'loading'
                ? 'Retrieving document text…'
                : 'Document text unavailable'
          }
          disabled={loading || !documentText}
          className="flex-1 rounded-full border border-hair bg-white px-4 py-2.5 text-sm text-ink placeholder-faint focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
